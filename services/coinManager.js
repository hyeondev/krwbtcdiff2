const { getAllMarkets, placeBuyOrder, placeSellOrder, checkOrderStatus, placeCancelOrder } = require("./upbitApi");
const CoinInfo = require("./CoinInfo");
const config = require('../config/config');

class CoinManager {
    constructor() {
        this.coins = []; // CoinInfo 객체 배열
        this.btcPriceInKRW = 0; // BTC의 원화 가격 저장 (KRW-BTC)
        this.activeTrades = new Map(); // 진행 중인 거래 관리
        this.maxConcurrentTrades = config.maxConcurrentTrades; // 최대 동시 거래 수
        this.checkInterval = null; // 상태 체크 Interval
        this.maxTradeMoney = config.maxTradeMoney;
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

            const krwBestBidPrice = krwMarket.orderbook?.orderbook_units[0]?.bid_price || 0; // 원화 마켓 매수 최고가
            const krwBestAskPrice = krwMarket.orderbook?.orderbook_units[0]?.ask_price || 0; // 원화 마켓 매도 최저가
            const btcBestBidPrice = btcMarket.orderbook?.orderbook_units[0]?.bid_price || 0; // BTC 마켓 매수 최고가
            const btcBestAskPrice = btcMarket.orderbook?.orderbook_units[0]?.ask_price || 0; // BTC 마켓 매도 최저가
            const btcAskSize = btcMarket.orderbook?.orderbook_units[0]?.ask_size || 0;
            const btcBidSize = btcMarket.orderbook?.orderbook_units[0]?.bid_size || 0;
            const krwBidSize = krwMarket.orderbook?.orderbook_units[0]?.bid_size || 0;
            const krwAskSize = krwMarket.orderbook?.orderbook_units[0]?.ask_size || 0;

            if (krwBestBidPrice === 0 || krwBestAskPrice === 0 || btcBestBidPrice === 0 || btcBestAskPrice === 0) {
                console.warn(`[데이터 부족] ${symbol}: 가격 데이터가 불완전합니다.`);
                return; // 데이터가 없으면 계산 스킵
            }

            // 100원 미만 코인 스킵
            // if (krwBestBidPrice < 100 && krwBestAskPrice < 10) {
            //     console.warn(`[거래 무시] ${symbol}: 가격이 10원 미만입니다.`);
            //     return;
            // }

            const btcToKrwBestAskPrice = btcBestAskPrice * this.btcPriceInKRW; // BTC 마켓 매도 최저가의 원화 환산 가격
            const btcToKrwBestBidPrice = btcBestBidPrice * this.btcPriceInKRW; // BTC 마켓 매수 최고가의 원화 환산 가격

            // 비트의 매도 최저가와 원화의 매수 최고가 비교 - 비트에서 매수하고 원화에서 팔기 
            const diff1 = ((krwBestBidPrice - btcToKrwBestAskPrice) / btcToKrwBestAskPrice) * 100;
            // 원화의 매도 최저가와 비트의 매수 최고가 비교 - 원화에서 매수하고 비트에서 팔기 
            const diff2 = ((btcToKrwBestBidPrice - krwBestAskPrice) / krwBestAskPrice) * 100;

            results.push({
                coin: symbol,
                btcMarket: btcMarket,
                krwMarket: krwMarket, 
                krwBestBidPrice: krwBestBidPrice,
                krwBestAskPrice: krwBestAskPrice,
                btcBestBidPrice: btcBestBidPrice,
                btcBestAskPrice: btcBestAskPrice,
                btcToKrwBestAskPrice: btcToKrwBestAskPrice.toFixed(2),
                btcToKrwBestBidPrice: btcToKrwBestBidPrice.toFixed(2),
                btcAskSize: btcAskSize,
                btcBidSize: btcBidSize,
                krwBidSize: krwBidSize,
                krwAskSize: krwAskSize,
                diff1: diff1.toFixed(2),
                diff2: diff2.toFixed(2),
                maxDiff: Math.max(diff1, diff2), // diff1과 diff2 중 최대값 저장
            });
        });

        // 결과를 diff1과 diff2의 최대값 기준으로 내림차순 정렬
        results.sort((a, b) => b.maxDiff - a.maxDiff);
        // 상위 3개만 유지
        const topResults = results.slice(0, 1);
        // 상위 3개에 대해 로그 출력
        topResults.forEach((result) => {
            const { coin, btcMarket, krwMarket, diff1, diff2, krwBestBidPrice, krwBestAskPrice, btcBestBidPrice, btcBestAskPrice, btcToKrwBestAskPrice, btcToKrwBestBidPrice, btcAskSize, btcBidSize, krwBidSize, krwAskSize } = result;
            
            // **1. 거래량 계산 로직 추가**
            const tradeAmount1 = this.calculateTradeAmount(
                btcAskSize,
                krwBidSize,
                krwBestBidPrice
            ); // BTC 마켓 매도 -> KRW 마켓 매수
            const tradeAmount2 = this.calculateTradeAmount(
                btcBidSize,
                krwAskSize,
                krwBestAskPrice
            ); // BTC 마켓 매수 -> KRW 마켓 매도
            
            if (diff1 > config.krwbitDiff) {
                // 너무 작은 금애
                if (tradeAmount1 * krwBestBidPrice < config.minTradeMoney)
                    return;

                console.log(
                    `[거래 조건 발견] ${coin}: BTC 마켓에서 ${btcBestAskPrice} BTC로 구매(${btcToKrwBestAskPrice} KRW), KRW 마켓에서 ${krwBestBidPrice} KRW로 판매 (차이: ${diff1}%)`
                );
                this.addTrade(coin, {
                    buyMarket: btcMarket,
                    buyPrice: btcBestAskPrice,
                    sellMarket: krwMarket,
                    sellPrice: krwBestBidPrice,
                    tradeAmount: tradeAmount1,
                    status: "ready",
                });
            }
            if (diff2 > config.krwbitDiff) {
                if (tradeAmount2 * krwBestAskPrice < config.minTradeMoney)
                    return;

                console.log(
                    `[거래 조견 발견] ${coin}: KRW 마켓에서 ${krwBestAskPrice} KRW로 구매, BTC 마켓에서 ${btcBestBidPrice} BTC로 판매(${btcToKrwBestBidPrice} KRW) (차이: ${diff2}%`
                );
                this.addTrade(coin, {
                    buyMarket: krwMarket,
                    buyPrice: krwBestAskPrice,
                    sellMarket: btcMarket,
                    sellPrice: btcBestBidPrice,
                    tradeAmount: tradeAmount2,
                    status: "ready",
                });
            }
        });
        return topResults;
    }

    calculateTradeAmount(btcSize, krwSize, krwPrice) {
        // 1. BTC와 KRW 마켓의 주문량 비교
        // console.log("btcSize: " + btcSize + "krwSize: " + krwSize + "krwPrice: " + krwPrice);
        const maxTradableSize = Math.min(btcSize, krwSize);
        // console.log("maxTradableSize: " + maxTradableSize);
        // 2. 거래 가능 금액
        const maxOrderbookMoney = maxTradableSize * krwPrice;
        // console.log('maxOrderbookMoney: ' + maxOrderbookMoney);
        // 3. 내가 설정한 금액으로 작은 양만 구매
        if (maxOrderbookMoney > this.maxTradeMoney) {
            // console.log('this.maxTradeMoney / krwPrice: ' + this.maxTradeMoney / krwPrice);
            return this.maxTradeMoney / krwPrice;
        }
        else {
            // console.log('maxTradableSize: ' + maxTradableSize);
            return maxTradableSize;
        }
    }

    // 거래 추가 및 즉시 처리
    addTrade(symbol, trade) {
        if (this.activeTrades.size >= this.maxConcurrentTrades) {
            console.warn(`[거래 제한] 최대 ${this.maxConcurrentTrades}개의 거래가 진행 중입니다. ${symbol} 거래를 건너뜁니다.`);
            return;
        }

        if (this.activeTrades.has(symbol)) {
            console.warn(`[중복 거래] ${symbol}: 동일한 코인에 대한 거래가 이미 진행 중입니다.`);
            return;
        }

        this.activeTrades.set(symbol, trade);

        // 거래 즉시 처리
        this.processTrade(symbol);
    }

    // 거래 상태 주기적으로 체크
    startTradeManagement() {
        if (this.checkInterval) return; // 이미 Interval이 설정된 경우 중복 실행 방지

        this.checkInterval = setInterval(() => {
            for (const [symbol, trade] of this.activeTrades) {
                if (trade.status === "ready" || trade.status === "bought" || trade.status === "wait") {
                    console.log(`[상태 체크] ${symbol}: 상태 - ${trade.status}`);
                    this.processTrade(symbol); // 상태별 처리
                }
            }
        }, 1000); // 1초 간격
    }

    // 거래 처리 로직
    async processTrade(symbol) {
        const trade = this.activeTrades.get(symbol);
        if (!trade) return;
    
        try {
            if (trade.status === "ready") {
                console.log(`[매수 시도] ${symbol}: ${trade.buyMarket}에서 ${trade.buyPrice}로 ${trade.tradeAmount} 매수.`);
                const buyResult = await placeBuyOrder(trade.buyMarket.market, trade.buyPrice, trade.tradeAmount);
    
                if (buyResult) {
                    if (buyResult.state === "done") {
                        console.log(`[매수 성공] ${symbol}: ${trade.buyMarket}에서 ${buyResult.executed_volume}개 매수.`);
                        trade.status = "bought";
                        trade.executedVolume = parseFloat(buyResult.executed_volume);
    
                        // 매수 성공 후 매도 진행
                        this.processTrade(symbol);
                    } else if (buyResult.state === "wait") {
                        console.warn(`[매수 미체결] ${symbol}: 주문 대기 중 -> UUID: ${buyResult.uuid}`);
                        // 주문 생성 시간 기록
                        trade.uuid = buyResult.uuid;
                        trade.createdAt = Date.now(); // 현재 시간 저장
                        trade.status = "waiting";
                    } else {
                        console.warn(`[매수 실패] ${symbol}: 주문 상태 -> state: ${buyResult.state}`);
                        await placeCancelOrder(buyResult.uuid);
                        this.activeTrades.delete(symbol); // 실패 시 거래 삭제
                    }
                }
            } else if (trade.status === "waiting") {
                // 주문 상태 확인
                const elapsed = Date.now() - trade.createdAt;
                const orderStatus = await checkOrderStatus(trade.uuid);
    
                if (orderStatus && orderStatus.state === "done") {
                    console.log(`[매수 완료] ${symbol}: ${trade.buyMarket}에서 ${orderStatus.executed_volume}개 매수.`);
                    trade.status = "bought";
                    trade.executedVolume = parseFloat(orderStatus.executed_volume);
    
                    // 매수 성공 후 매도 진행
                    this.processTrade(symbol);
                } else if (elapsed >= 3000) {
                    console.warn(`[매수 취소] ${symbol}: 3초 경과 후 미체결 상태 -> UUID: ${trade.uuid}`);
                    await placeCancelOrder(trade.uuid);
                    this.activeTrades.delete(symbol); // 실패 시 거래 삭제
                } else {
                    console.log(`[대기 중] ${symbol}: 아직 3초 경과하지 않음 (${elapsed / 1000}s 경과). 매수 상태 확인 중...`);
                }
            } else if (trade.status === "bought") {
                console.log(`[매도 시도] ${symbol}: ${trade.sellMarket}에서 매도 진행.`);
                const sellResult = await placeSellOrder(
                    trade.sellMarket.market,
                    trade.sellPrice,
                    trade.executedVolume
                );
    
                if (sellResult && sellResult.state === "done") {
                    console.log(`[매도 성공] ${symbol}: ${trade.sellMarket}에서 매도 완료.`);
                    this.activeTrades.delete(symbol); // 성공 시 거래 삭제
                } else {
                    console.warn(`[매도 실패] ${symbol}: 손절 체크 진행.`);
                    const currentAskPrice = this.getOrderbookAskPrice(trade.sellMarket);
    
                    if (currentAskPrice < trade.sellPrice * 0.99) {
                        console.log(`[손절 진행] ${symbol}: ${currentAskPrice}로 매도.`);
                        const sellResult = await placeSellOrder(trade.sellMarket.market, currentAskPrice, trade.executedVolume);
                        if (sellResult.data.state == "done") {
                            trade.executedVolume -= sellResult.data.remaining_volume;
                            if (trade.executedVolume <= 0) {
                                console.log(`[손절 완료] ${symbol}: ${currentAskPrice}로 매도.`);
                                this.activeTrades.delete(symbol); // 손절 후 거래 삭제
                            } else {
                                console.log(`[손절 완료 - 아직 남아있음] ${symbol}: ${trade.executedVolume}개 남음.`);
                            }
                        }
                    } else {
                        // 손절하지 않고 매도 대기 상태
                    }
                }
            }
        } catch (error) {
            console.error(`[거래 처리 오류] ${symbol}: ${error.message}`);
            this.activeTrades.delete(symbol);
        }
    }

    // 특정 마켓의 매도 호가 가져오기
    getOrderbookAskPrice(market) {
        const coin = this.coins.find((c) => c.market === market);
        return coin?.orderbook?.orderbook_units[0]?.ask_price || 0;
    }
}

module.exports = CoinManager;
