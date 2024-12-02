const express = require("express");
const { Server } = require("socket.io");
const http = require("http");
const CoinManager = require("./services/coinManager");
const WebSocketManager = require("./services/websocket");
const { getAccountInfo } = require("./services/upbitApi");
const config = require('./config/config');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 8000;

// 정적 파일 제공
app.use(express.static("public"));

// 라우트
app.get("/", (req, res) => {
  console.log('browser connect.');
  res.sendFile(__dirname + "/public/index.html");
});

// Socket.IO 연결 처리
io.on("connection", (socket) => {
  console.log("Client connected");

  // 3초마다 자산 정보 전송
  const accountInterval = setInterval(async () => {
    const accountData = await getAccountInfo();
    socket.emit("accountUpdate", accountData); // "accountUpdate" 이벤트로 데이터 전송
  }, config.accountUpdateDelay);

  // WebSocket을 통한 코인 가격 모니터링
  // monitorCoinPrice((coinData) => {
  //   socket.emit("priceAlert", coinData); // "priceAlert" 이벤트로 데이터 전송
  // });

  // 연결 종료 시 정리
  socket.on("disconnect", () => {
    console.log("Client disconnected");
    clearInterval(accountInterval);
  });

  socket.on("error", (err) => {
    console.error("WebSocket 오류:", err.message)
  });
});

server.on("error", (err) => {
  console.log(err);
});

// 서버 실행
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

(async () => {
  // 코인 데이터 초기화
  const coinManager = new CoinManager();
  await coinManager.initializeCoins();
  // 1분마다 코인 목록 업데이트
  setInterval(async () => {
    console.log("Updating coin list every 1min ...");
    await coinManager.updateCoins();
  }, 60000);

  // coins가 배열인지 확인
  if (!Array.isArray(coinManager.coins) || coinManager.coins.length === 0) {
    console.error("CoinManager.coins is not initialized or empty.");
    return;
}

  // WebSocketManager 초기화
  const wsManager = new WebSocketManager();

  // 메시지 타입별 이벤트 핸들러 등록
  wsManager.addEventHandler("ticker", (data) => {
    coinManager.updateTicker(data.code, data);
      //console.log(`Ticker Update: ${data.code} - ${data.trade_price}`);
  });

  wsManager.addEventHandler("trade", (data) => {
    coinManager.updateTrade(data.code, data);
      // console.log(`Trade Update: ${data.code} - ${data.trade_price} @ ${data.trade_volume}`);
  });

  wsManager.addEventHandler("orderbook", (data) => {
    coinManager.updateOrderbook(data.code, data);
    // console.log(`Order Update: ${data.code} - ${data.timestamp}`);
    // console.table(data.orderbook_units.map(unit => ({
    //   "Ask Price (매도가격)": unit.ask_price,
    //   "Ask Size (매도량)": unit.ask_size,
    //   "Bid Price (매수가격)": unit.bid_price,
    //   "Bid Size (매수량)": unit.bid_size,
    // })));
  });

  // Ticker 데이터 구독 추가
  wsManager.addSubscription(
      "ticker",
      coinManager.coins.map((coin) => coin.market) // 모든 코인 구독
  );

  // Trade 데이터 구독 추가
  wsManager.addSubscription(
      "trade",
      coinManager.coins.map((coin) => coin.market) // 모든 코인 구독
  );

  // Order 데이터 구독 추가
  // wsManager.addSubscription(
  //     "orderbook",
  //     coinManager.coins.map((coin) => `${coin.market}.1`) // 모든 코인 구독
  // );

  // WebSocket 연결 시작
  wsManager.startConnection();
})();