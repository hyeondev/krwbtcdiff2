const { getAllMarkets } = require("./upbitApi");
const CoinInfo = require("./CoinInfo");

class CoinManager {
    constructor() {
        this.coins = []; // CoinInfo 객체 배열
    }

    // 초기화: 업비트 API에서 코인 목록 가져오기
    async initializeCoins() {
        try {
            const marketData = await getAllMarkets();
            this.coins = marketData
                .filter((market) => !market.market.includes("USDT")) // USDT 마켓 제외
                .map(
                    (market) => new CoinInfo(market.market, market.korean_name, market.english_name)
                );

            console.log(`Initialized ${this.coins.length} coins.`);
        } catch (error) {
            console.error("Error initializing coins:", error.message);
        }
    }

    // 코인 목록 업데이트
    async updateCoins() {
        try {
            const marketData = await getAllMarkets();
            const newMarkets = marketData
                .filter((market) => !market.market.includes("USDT")) // USDT 마켓 제외
                .map((market) => market.market);

            // 추가된 코인 찾기
            const addedCoins = marketData.filter(
                (market) =>
                    !this.coins.some((coin) => coin.market === market.market) &&
                    !market.market.includes("USDT")
            );
            if (addedCoins.length > 0) {
                addedCoins.forEach((market) =>
                    this.coins.push(new CoinInfo(market.market, market.korean_name, market.english_name))
                );
                console.log(`Added ${addedCoins.length} new coins.`);
            }

            // 삭제된 코인 찾기
            const removedCoins = this.coins.filter((coin) => !newMarkets.includes(coin.market));
            if (removedCoins.length > 0) {
                this.coins = this.coins.filter((coin) => newMarkets.includes(coin.market));
                console.log(`Removed ${removedCoins.length} coins.`);
            }
        } catch (error) {
            console.error("Error updating coins:", error.message);
        }
    }

    // 특정 마켓 코드로 코인 찾기
    findCoinByMarket(market) {
        return this.coins.find((coin) => coin.market === market);
    }

    // 모든 코인 정보 출력
    printCoins() {
        this.coins.forEach((coin) => {
            //console.log(`Market: ${coin.market}, Name: ${coin.koreanName} (${coin.englishName})`);
        });
    }

    // Ticker 업데이트
    updateTicker(market, tickerData) {
        const coin = this.coins.find((c) => c.market === market);
        if (coin) {
            coin.updateTicker(tickerData);
        }
    }

    // Trade 업데이트
    updateTrade(market, tradeData) {
        const coin = this.coins.find((c) => c.market === market);
        if (coin) {
            coin.updateTrade(tradeData);
        }
        console.log(tradeData);
    }

    // Orderbook 업데이트
    updateOrderbook(market, orderbookData) {
        const coin = this.coins.find((c) => c.market === market);
        if (coin) {
            coin.updateOrderbook(orderbookData);
        }
    }
}

module.exports = CoinManager;
