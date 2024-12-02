const express = require("express");
const { Server } = require("socket.io");
const http = require("http");
const { getAccountInfo } = require("./services/exchangeApi");
const upbitApi = require("./services/upbitApi");
//const { monitorCoinPrice } = require("./services/websocket");
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
