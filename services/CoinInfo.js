//코인 정보를 정의하는 클래스
class CoinInfo {
    constructor(market, koreanName, englishName) {
        this.market = market; // 마켓 코드 (예: 'KRW-BTC')
        this.koreanName = koreanName; // 코인의 한글명 (예: '비트코인')
        this.englishName = englishName; // 코인의 영문명 (예: 'Bitcoin')
    }
}

module.exports = CoinInfo;
