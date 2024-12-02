const { getAllMarkets } = require("./upbitApi");
const CoinInfo = require("./CoinInfo");

class CoinManager {
    constructor() {
        this.coins = []; // CoinInfo 객체 배열
        this.btcPriceInKRW = 0; // BTC의 원화 가격 저장 (KRW-BTC)
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
            if (market === "KRW-BTC") {
                this.btcPriceInKRW = tickerData.trade_price; // BTC의 원화 가격 저장
            }
        }
    }

    // Trade 업데이트
    updateTrade(market, tradeData) {
        const coin = this.coins.find((c) => c.market === market);
        if (coin) {
            coin.updateTrade(tradeData);
        }
    }

    // Orderbook 업데이트
    updateOrderbook(market, orderbookData) {
        const coin = this.coins.find((c) => c.market === market);
        if (coin) {
            coin.updateOrderbook(orderbookData);
        }
    }

    checkPriceDifferencesForAllCoins() {
        const results = [];
        const btcMarkets = this.coins.filter((coin) => coin.market.startsWith("BTC-")); // BTC 마켓만 필터링

        btcMarkets.forEach((btcMarket) => {
            const symbol = btcMarket.market.split('-')[1];
    
            // 원화 마켓 찾기
            const krwMarket = this.coins.find((c) => c.market === `KRW-${symbol}`);
    
            if (!krwMarket || !this.btcPriceInKRW) {
                return; // 필요한 데이터가 없으면 스킵
            }

            // 최근 거래인지 확인
            // const isRecentTrade = (trade) => {
            //     console.log(trade.code + " 시간: " +  Math.abs(trade.timestamp - trade.trade_timestamp));
            //     return trade && Math.abs(trade.timestamp - trade.trade_timestamp) <= 5000; // 5초 이내 확인
            // };
            // if (
            //     !isRecentTrade(btcMarket.ticker) ||
            //     !isRecentTrade(krwMarket.ticker)
            // ) {
            //     console.warn(`[거래 무시] ${symbol}: 최근 5초 내의 거래 데이터가 아닙니다.`);
            //     return; // 3초 이내의 거래가 아니면 스킵
            // }
    
            const krwBestBidPrice = krwMarket.orderbook?.orderbook_units[0]?.bid_price || 0; // 원화 마켓 매수 최고가
            const krwBestAskPrice = krwMarket.orderbook?.orderbook_units[0]?.ask_price || 0; // 원화 마켓 매도 최저가
            const btcBestBidPrice = btcMarket.orderbook?.orderbook_units[0]?.bid_price || 0; // BTC 마켓 매수 최고가
            const btcBestAskPrice = btcMarket.orderbook?.orderbook_units[0]?.ask_price || 0; // BTC 마켓 매도 최저가

            if (krwBestBidPrice === 0 || krwBestAskPrice === 0 || btcBestBidPrice === 0 || btcBestAskPrice === 0) {
                console.warn(`[데이터 부족] ${symbol}: 가격 데이터가 불완전합니다.`);
                return; // 데이터가 없으면 계산 스킵
            }

            // 100원 미만 코인 스킵
            if (krwBestBidPrice < 100 && krwBestAskPrice < 100) {
                //console.warn(`[거래 무시] ${symbol}: 가격이 100원 미만입니다.`);
                return;
            }
    
            const btcToKrwBestAskPrice = btcBestAskPrice * this.btcPriceInKRW; // BTC 마켓 매도 최저가의 원화 환산 가격
            const btcToKrwBestBidPrice = btcBestBidPrice * this.btcPriceInKRW; // BTC 마켓 매수 최고가의 원화 환산 가격
    
            // 비트의 매도 최저가와 원화의 매수 최고가 비교
            const diff1 = ((krwBestBidPrice - btcToKrwBestAskPrice) / btcToKrwBestAskPrice) * 100;
    
            // 원화의 매도 최저가와 비트의 매수 최고가 비교
            const diff2 = ((btcToKrwBestBidPrice - krwBestAskPrice) / krwBestAskPrice) * 100;
    
            results.push({
                coin: symbol,
                krwBestBidPrice,
                krwBestAskPrice,
                btcBestBidPrice,
                btcBestAskPrice,
                btcToKrwBestAskPrice: btcToKrwBestAskPrice.toFixed(2),
                btcToKrwBestBidPrice: btcToKrwBestBidPrice.toFixed(2),
                diff1: diff1.toFixed(2),
                diff2: diff2.toFixed(2),
            });
    
            // 차이 1% 이상인 경우 로그
            if (diff1 > 0.2) {
                console.log(
                    `[매수/매도 제안] ${symbol}: BTC 마켓에서 ${btcBestAskPrice} BTC로 구매(${btcToKrwBestAskPrice}), KRW 마켓에서 ${krwBestBidPrice} KRW로 판매 (차이: ${diff1.toFixed(2)}%) ${btcMarket.trade.trade_time}`
                );
            }
    
            if (diff2 > 0.2) {
                console.log(
                    `[매수/매도 제안] ${symbol}: KRW 마켓에서 ${krwBestAskPrice} KRW로 구매, BTC 마켓에서 ${btcBestBidPrice} BTC로 판매(${btcToKrwBestBidPrice}) (차이: ${diff2.toFixed(2)}%)`
                );
            }
        });
    
        return results;
    }
}

module.exports = CoinManager;
