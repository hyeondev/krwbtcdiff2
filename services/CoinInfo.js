//코인 정보를 정의하는 클래스
class CoinInfo {
    constructor(market, koreanName, englishName) {
        this.market = market; // 마켓 코드 (예: 'KRW-BTC')
        this.koreanName = koreanName; // 코인의 한글명 (예: '비트코인')
        this.englishName = englishName; // 코인의 영문명 (예: 'Bitcoin')

        // 새로운 필드 추가
        this.ticker = null; // 실시간 Ticker 정보 저장
        this.trade = null;
        this.orderbook = null;
    }

    // Ticker 정보 업데이트
    updateTicker(tickerData) {
        this.ticker = tickerData;
    }

    // Trade 정보 업데이트
    updateTrade(tradeData) {
        this.trade = tradeData;
    }

    // Orderbook 정보 업데이트
    updateOrderbook(orderbookData) {
        this.orderbook = orderbookData;
    }
}

module.exports = CoinInfo;
