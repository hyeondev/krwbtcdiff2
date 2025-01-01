const WebSocket = require("ws");

// 거래 대상 코인 목록
const coins = ["BTC", "XRP", "DOGE"];

// 업비트, 빗썸 마켓 심볼 맵핑
const upbitSymbols = {
  "BTC": "KRW-BTC",
  "XRP": "KRW-XRP",
  "DOGE": "KRW-DOGE"
};

const bithumbSymbols = {
  "BTC": "KRW-BTC",
  "XRP": "KRW-XRP",
  "DOGE": "KRW-DOGE"

};

// 실시간 가격 저장용 객체 {코인명: {upbit:[], bithumb:[]}}
const priceData = {};
coins.forEach(c => {
  priceData[c] = { upbit: [], bithumb: [] };
});

// 최대 저장 데이터 포인트
const MAX_DATA_POINTS = 300;

// 상관계수 계산 함수(피어슨 상관계수)
function pearsonCorrelation(x, y) {
  const n = x.length;
  if (n === 0) return 0;
  
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  if (denomX === 0 || denomY === 0) return 0; 
  return numerator / Math.sqrt(denomX * denomY);
}

// 선행성 판단을 위한 간단한 lag 테스트
function checkLeadLag(xData, yData, maxLag = 5) {
  // x가 y를 선도하는지 테스트
  let bestXLeadCorr = -2;
  let bestXLeadLag = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    if (xData.length > lag && yData.length > lag) {
      const shiftedX = xData.slice(lag);
      const truncatedY = yData.slice(0, yData.length - lag);
      if (shiftedX.length === truncatedY.length) {
        const corr = pearsonCorrelation(shiftedX, truncatedY);
        if (corr > bestXLeadCorr) {
          bestXLeadCorr = corr;
          bestXLeadLag = lag;
        }
      }
    }
  }

  // y가 x를 선도하는지 테스트
  let bestYLeadCorr = -2;
  let bestYLeadLag = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    if (yData.length > lag && xData.length > lag) {
      const shiftedY = yData.slice(lag);
      const truncatedX = xData.slice(0, xData.length - lag);
      if (shiftedY.length === truncatedX.length) {
        const corr = pearsonCorrelation(shiftedY, truncatedX);
        if (corr > bestYLeadCorr) {
          bestYLeadCorr = corr;
          bestYLeadLag = lag;
        }
      }
    }
  }

  return {
    upbitLeadsCorr: bestXLeadCorr,
    upbitLeadsLag: bestXLeadLag,
    bithumbLeadsCorr: bestYLeadCorr,
    bithumbLeadsLag: bestYLeadLag
  };
}

// 일정 주기로 분석
function analyze() {
  console.log("=== Lead/Lag Analysis ===");
  for (const c of coins) {
    const uData = priceData[c].upbit;
    const bData = priceData[c].bithumb;
    if (uData.length < 30 || bData.length < 30) {
      console.log(`${c}: 데이터 부족`);
      continue;
    }
    const result = checkLeadLag(uData, bData);

    console.log(`[${c}]`);
    console.log(`Upbit leading Bithumb: corr=${result.upbitLeadsCorr.toFixed(3)}, lag=${result.upbitLeadsLag}`);
    console.log(`Bithumb leading Upbit: corr=${result.bithumbLeadsCorr.toFixed(3)}, lag=${result.bithumbLeadsLag}`);

    if (result.upbitLeadsCorr > result.bithumbLeadsCorr) {
      console.log(`=> Upbit이 Bithumb보다 ${c} 가격에 대해 선행 신호를 보일 가능성 높음`);
    } else if (result.bithumbLeadsCorr > result.upbitLeadsCorr) {
      console.log(`=> Bithumb이 Upbit보다 ${c} 가격에 대해 선행 신호를 보일 가능성 높음`);
    } else {
      console.log(`=> 명확한 선도 관계 파악 어려움`);
    }
  }
}

// 업비트 WebSocket 연결
const upbitWs = new WebSocket('wss://api.upbit.com/websocket/v1');
upbitWs.on('open', () => {
  const subscribeMsg = [
    { "ticket": "test" },
    { "type": "ticker", "codes": coins.map(c => upbitSymbols[c]) }
  ];
  upbitWs.send(JSON.stringify(subscribeMsg));
});

upbitWs.on('message', (data) => {
  const parsed = JSON.parse(data.toString());
  // 업비트 ticker 예: {type:"ticker", code:"KRW-BTC", trade_price:...}
  if (parsed.type === 'ticker') {   
    const code = parsed.code; // "KRW-BTC" 형태
    const coin = Object.keys(upbitSymbols).find(k => upbitSymbols[k] === code);
    if (coin) {
      const price = parsed.trade_price;
      priceData[coin].upbit.push(price);
      if (priceData[coin].upbit.length > MAX_DATA_POINTS) {
        priceData[coin].upbit.shift();
      }
    }
  }
});

// 빗썸 WebSocket 연결
const bithumbWs = new WebSocket('wss://ws-api.bithumb.com/websocket/v1');
bithumbWs.on('open', () => {
  const subscribeMsg = [
    { "ticket": "test123" },
    { "type": "ticker", "codes": coins.map(c => bithumbSymbols[c]) }
  ];
  bithumbWs.send(JSON.stringify(subscribeMsg));
});

bithumbWs.on('message', (data) => {
  const parsed = JSON.parse(data.toString());
  if (parsed.type === 'ticker') {   
    const code = parsed.code; 
    const coin = Object.keys(upbitSymbols).find(k => upbitSymbols[k] === code);
    if (coin) {
      const price = parsed.trade_price;
      
      // 올바르게 bithumb 배열에 데이터를 저장
      priceData[coin].bithumb.push(price);
      if (priceData[coin].bithumb.length > MAX_DATA_POINTS) {
        priceData[coin].bithumb.shift();
      }
    }
  }
});

bithumbWs.on("error", (error) => {
  console.error("WebSocket error:", error.message);
});

// 일정 시간 간격으로 선도성 분석
setInterval(analyze, 60000); // 1분마다 분석
