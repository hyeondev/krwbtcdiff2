const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const WebSocket = require("ws");
const axios = require("axios");
const fs = require("fs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const querystring = require("querystring");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 8000;

// 초기 상태
let ACCESS_KEY = "";
let SECRET_KEY = "";
let tradingEnabled = false; // 거래 활성화 여부
let balances = [];
let totalProfit = 0; // 총 수익
let trades = { inProgress: [], completed: [] }; // 거래 내역
let activeTrades = new Set(); // 진행 중인 거래 코인 목록

// 테스트 거래 설정
const TEST_TRADE_AMOUNT = 10000; // 거래 대금 1만 원
const MIN_PRICE_KRW = 100; // 최소 원화 가격
const PRICE_DIFF_PERCENT = 3; // 차익 비율
const MAX_TIME_DIFF = 10 * 1000; // 체결 시간 차이 (10초 이내)

// info.txt에서 API 키 로드
function loadAPIKeys() {
  try {
    const data = fs.readFileSync("info.txt", "utf-8");
    const lines = data.split("\n");
    const accessKeyLine = lines.find((line) => line.startsWith("access_key"));
    const secretKeyLine = lines.find((line) => line.startsWith("secret_key"));

    if (!accessKeyLine || !secretKeyLine) {
      throw new Error("access_key 또는 secret_key가 파일에 존재하지 않습니다.");
    }

    ACCESS_KEY = accessKeyLine.split(":")[1]?.trim();
    SECRET_KEY = secretKeyLine.split(":")[1]?.trim();
  
    if (!ACCESS_KEY || !SECRET_KEY) {
      throw new Error("access_key 또는 secret_key가 올바르게 설정되지 않았습니다.");
    }

    console.log("API 키가 성공적으로 로드되었습니다.");
  } catch (err) {
    console.error("API 키 파일을 읽는 중 오류가 발생했습니다:", err);
    process.exit(1);
  }
}

// JWT 생성 함수
function createJWT(query) {
  const payload = {
    access_key: ACCESS_KEY,
    nonce: crypto.randomUUID(), // 고유값 생성
  };

  // 쿼리가 있을 경우 query_hash 추가
  if (query) {
    const queryString = querystring.encode(query); // 쿼리 문자열 생성
    const queryHash = crypto.createHash("sha512").update(queryString, "utf-8").digest("hex"); // query_hash 생성
    payload.query_hash = queryHash;
    payload.query_hash_alg = "SHA512";
  }

  // JWT 생성 (jsonwebtoken 사용)
  return `Bearer ${jwt.sign(payload, SECRET_KEY)}`;
}

// 업비트 API 호출
async function fetchUpbit(endpoint, method = "GET", params = {}) {
  try {
    const query = new URLSearchParams(params).toString();
    const jwtToken = createJWT(query);
    console.log("Generated JWT Token:", jwtToken);

    const options = {
      method,
      url: `https://api.upbit.com/v1${endpoint}${query ? "?" + query : ""}`,
      headers: { Authorization: jwtToken },
    };
    console.log("API Request Options:", options);

    const response = await axios(options);
    return response.data;
  } catch (error) {
    console.error(`Upbit API 호출 오류 (${endpoint}):`, error.message);
    if (error.response) {
      console.error("HTTP 상태 코드:", error.response.status);
      console.error("응답 데이터:", error.response.data);
    }
    throw error;
  }
}

// 보유 자산 업데이트
async function updateBalances() {
  try {
    balances = await fetchUpbit("/accounts");
    console.log('balances' + balances.balance);
    io.emit("balances", balances);
  } catch (error) {
    console.error("잔고 업데이트 오류:", error.message);
  }
}

// WebSocket 체결 정보 모니터링
function monitorTrades() {
  const socket = new WebSocket("wss://api.upbit.com/websocket/v1");

  socket.on("open", () => {
    console.log("WebSocket 연결 성공");
    socket.send(
      JSON.stringify([
        { ticket: "trading-monitor" },
        { type: "trade", codes: ["KRW-BTC", "BTC-ETH"] }, // 모든 코인 확장 가능
      ])
    );
  });

  socket.on("message", async (data) => {
    if (!tradingEnabled) return; // 거래 중지 상태일 경우 실행하지 않음

    const trade = JSON.parse(data.toString());
    const market = trade.code;
    const price = trade.trade_price;
    const now = Date.now();

    if (!market.startsWith("KRW-")) return;
    const btcMarket = market.replace("KRW-", "BTC-");
    const btcPrice = price / 1000; // 가정된 BTC 가격

    if (activeTrades.has(market)) return;

    if (Math.abs(btcPrice - price) / price > PRICE_DIFF_PERCENT / 100) {
      console.log(Math.abs(btcPrice - price) / price + ' ' + btcMarket);
      activeTrades.add(market);
      const volume = (TEST_TRADE_AMOUNT / price).toFixed(8);

      try {
        console.log(`거래 시작: ${market} - 가격 차이 ${PRICE_DIFF_PERCENT}%`);
        const buy = await placeOrder(market, "bid", volume, price);
        const sell = await placeOrder(btcMarket, "ask", volume, btcPrice);

        // 거래 완료 처리
        const profit = TEST_TRADE_AMOUNT * (btcPrice - price) / price;
        totalProfit += profit;

        trades.completed.push({
          market,
          volume,
          buyPrice: price,
          sellPrice: btcPrice,
          profit,
          time: new Date().toLocaleString(),
        });

        io.emit("tradeCompleted", trades.completed);
        io.emit("profitUpdate", totalProfit);
      } catch (error) {
        console.error("거래 중 오류:", error.message);
      } finally {
        activeTrades.delete(market);
      }
    }
  });

  socket.on("error", (err) => console.error("WebSocket 오류:", err.message));
}

// 주문 요청 함수
async function placeOrder(market, side, volume, price) {
  const params = {
    market,
    side,
    volume: side === "bid" ? undefined : volume,
    price: side === "bid" ? price : undefined,
    ord_type: "price",
  };

  return fetchUpbit("/orders", "POST", params);
}

// Socket.io 이벤트
io.on("connection", (socket) => {
  console.log("클라이언트 연결됨");

  socket.on("startTrading", () => {
    tradingEnabled = true;
    io.emit("tradingStatus", tradingEnabled);
    console.log("거래가 시작되었습니다.");
  });

  socket.on("stopTrading", () => {
    tradingEnabled = false;
    io.emit("tradingStatus", tradingEnabled);
    console.log("거래가 중지되었습니다.");
  });

  socket.on("getBalances", updateBalances);
});

// 정적 파일 제공
app.use(express.static("public"));

// 서버 시작
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  loadAPIKeys(); // API 키 로드
  updateBalances(); // 잔고 업데이트
  monitorTrades(); // 체결 모니터링 시작
});
