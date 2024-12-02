const { getAllMarkets } = require("./upbitApi");
const CoinInfo = require("./CoinInfo");

let coins = []; // CoinInfo 객체 배열

// 초기화: 업비트 API에서 코인 목록 가져오기
async function initializeCoins() {
    try {
        const marketData = await getAllMarkets();
        coins = marketData
            .filter((market) => !market.market.includes("USDT")) // USDT 마켓 제외
            .map(
                (market) => new CoinInfo(market.market, market.korean_name, market.english_name)
            );

        console.log(`Initialized ${coins.length} coins.`);
    } catch (error) {
        console.error("Error initializing coins:", error.message);
    }
}

// 코인 목록 업데이트
async function updateCoins() {
    try {
        const marketData = await getAllMarkets();
        const newMarkets = marketData
            .filter((market) => !market.market.includes("USDT")) // USDT 마켓 제외
            .map((market) => market.market);

        // 추가된 코인 찾기
        const addedCoins = marketData.filter(
            (market) =>
                !coins.some((coin) => coin.market === market.market) &&
                !market.market.includes("USDT")
        );
        if (addedCoins.length > 0) {
            addedCoins.forEach((market) =>
                coins.push(new CoinInfo(market.market, market.korean_name, market.english_name))
            );
            console.log(`Added ${addedCoins.length} new coins.`);
        }

        // 삭제된 코인 찾기
        const removedCoins = coins.filter((coin) => !newMarkets.includes(coin.market));
        if (removedCoins.length > 0) {
            coins = coins.filter((coin) => newMarkets.includes(coin.market));
            console.log(`Removed ${removedCoins.length} coins.`);
        }
    } catch (error) {
        console.error("Error updating coins:", error.message);
    }
}

module.exports = { initializeCoins, updateCoins, coins };
