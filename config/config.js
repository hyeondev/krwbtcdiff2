const config = {
	apiKey: '',
	baseDelay: 105, //초당 10회라서 100ms 보다 크게
	lazyDelay: 300, //요청 제한에 걸리면 300ms 로
	accountUpdateDelay: 3000, //요청 제한에 걸리면 300ms 로
	baseUrl: 'https://api.upbit.com/v1',
	maxConcurrentTrades: 6, // 시세차익 로직에서 진행하는 최대 동시 거래 
	maxTradeAmount: 10000, // 설정한 최대 주문 금액 (500,000 KRW)

}

module.exports = config;