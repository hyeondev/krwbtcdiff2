const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const WebSocket = require("ws");
const axios = require("axios");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 8000;
const MIN_PRICE_KRW = 100; // 최소 거래 금액
const PRICE_DIFF_PERCENT = 0.1; // 차익 비율
const MAX_TIME_DIFF = 10 * 1000; // 최대 체결 시간 차이 (10초)

// Market 데이터
let marketList = [];
let marketData = {};
let trades = []; // 매수/매도 결과 저장
let activeTrades = new Set(); // 진행 중인 거래 코인 목록

// 마켓 리스트 가져오기
async function fetchMarketList() {
  try {
    const response = await axios.get("https://api.upbit.com/v1/market/all");
    const markets = response.data;

    marketList = markets.filter((m) =>
      ["KRW-", "BTC-"].some((prefix) => m.market.startsWith(prefix))
    );

    marketList.forEach((market) => {
      marketData[market.market] = { price: null, tradeTime: null };
    });

    console.log(`마켓 수: ${marketList.length}`);
  } catch (error) {
    console.error("마켓 목록 가져오기 오류:", error.message);
  }
}

// WebSocket 실시간 체결 정보 모니터링
function monitorArbitrage() {
    const socket = new WebSocket("wss://api.upbit.com/websocket/v1");
  
    socket.on("open", () => {
      console.log("WebSocket 연결 성공");
  
      const marketCodes = marketList.map((m) => m.market);
      socket.send(
        JSON.stringify([
          { ticket: "arbitrage-monitor" },
          { type: "trade", codes: marketCodes },
        ])
      );
    });
  
    socket.on("message", (data) => {
      const trade = JSON.parse(data.toString());
      const market = trade.code;
      const price = trade.trade_price;
      const tradeTime = new Date(trade.trade_timestamp).getTime();
      const askBid = trade.ask_bid; // 매수("BID") 또는 매도("ASK")
  
      // 마켓 데이터 업데이트
      marketData[market] = { price, tradeTime, askBid };
  
      // 차익 거래 기회 탐색
      findArbitrageOpportunities();
    });
  
    socket.on("error", (err) => console.error("WebSocket 오류:", err.message));
}

// 차익 거래 기회 탐색
function findArbitrageOpportunities() {
    const krwMarkets = Object.keys(marketData).filter((m) => m.startsWith("KRW-"));
    const btcMarkets = Object.keys(marketData).filter((m) => m.startsWith("BTC-"));
    const btcKrwPrice = marketData["KRW-BTC"]?.price;
  
    if (!btcKrwPrice) return;
  
    const now = Date.now();
  
    for (const krwMarket of krwMarkets) {
      const coin = krwMarket.replace("KRW-", "");
      const btcMarket = `BTC-${coin}`;
  
      if (
        !btcMarkets.includes(btcMarket) ||
        !marketData[krwMarket]?.price ||
        !marketData[btcMarket]?.price
      ) {
        continue;
      }
  
      const krwPrice = marketData[krwMarket].price;
      const btcPrice = marketData[btcMarket].price * btcKrwPrice;
      const krwTradeTime = marketData[krwMarket].tradeTime;
      const btcTradeTime = marketData[btcMarket].tradeTime;
      const krwAskBid = marketData[krwMarket].askBid;
      const btcAskBid = marketData[btcMarket].askBid;
  
      // 거래 시간 확인 (10초 이내)
      if (now - krwTradeTime > MAX_TIME_DIFF || now - btcTradeTime > MAX_TIME_DIFF) {
        continue;
      }
  
      // 진행 중인 거래 확인
      if (activeTrades.has(coin)) {
        continue;
      }
  

      
      // 가격 차이 계산
      const priceDifference = Math.abs((krwPrice - btcPrice) / krwPrice) * 100;
      if (priceDifference > PRICE_DIFF_PERCENT && krwPrice >= MIN_PRICE_KRW) {
        // 매수/매도 방향 확인
        if (krwAskBid === "BID" && btcAskBid === "ASK") {
            // KRW에서 매수, BTC에서 매도
            if (krwPrice < btcPrice) {
                executeTrade(coin, krwPrice, btcPrice, priceDifference);
            }

        } else if (krwAskBid === "ASK" && btcAskBid === "BID") {  
            // KRW에서 매도, BTC에서 매수
            if (krwPrice > btcPrice) {
                executeTrade(coin, krwPrice, btcPrice, priceDifference);
            }
        }
      }
        
      
    }
  }

// 매수/매도 수행 및 수익률 계산
async function executeTrade(coin, krwPrice, btcPrice, priceDifference) {
    // 진행 중인 거래 등록
    activeTrades.add(coin);
  
    const krwAskBid = marketData[`KRW-${coin}`].askBid;
    const btcAskBid = marketData[`BTC-${coin}`].askBid;
  
    const trade = {
      coin,
      krwPrice,
      btcPrice,
      time: new Date().toLocaleTimeString(),
      action: "",
      profit: 0,
    };
  
    // 실제 매수/매도 방향에 따라 거래 설정
    if (krwAskBid === "BID" && btcAskBid === "ASK") {
      // 원화에서 매수, 비트코인에서 매도
      trade.action = "KRW에서 매수 -> BTC에서 매도";
      trade.profit = ((btcPrice - krwPrice) / krwPrice) * 100;
    } else if (krwAskBid === "ASK" && btcAskBid === "BID") {
      // 비트코인에서 매수, 원화에서 매도
      trade.action = "BTC에서 매수 -> KRW에서 매도";
      trade.profit = ((krwPrice - btcPrice) / btcPrice) * 100;
    } else {
      // 매수/매도 방향이 일치하지 않으면 거래를 수행하지 않음
      console.log("매수/매도 방향 불일치, 거래 취소:", trade);
      activeTrades.delete(coin); // 상태 제거
      return;
    }
  
    // 거래 결과 저장 및 클라이언트에 전송
    trades.push(trade);
    console.log("거래 수행:", trade);
    io.emit("trade", trade);
  
    // 거래가 완료되었다고 가정 후 상태 제거
    setTimeout(() => {
      activeTrades.delete(coin); // 거래 완료
      console.log(`거래 종료: ${coin}`);
    }, 5000); // 5초 후 거래 완료 (테스트 목적)
  }

// 정적 파일 제공
app.use(express.static("public"));

// 서버 시작
server.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  await fetchMarketList();
  monitorArbitrage();
});
