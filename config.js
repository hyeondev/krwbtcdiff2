const config = {
	apiKey: '',
	baseDelay: 105, //초당 10회라서 100ms 보다 크게
	lazyDelay: 300, //요청 제한에 걸리면 300ms 로
	accountUpdateDelay: 3000, //요청 제한에 걸리면 300ms 로
	baseUrl: 'https://api.upbit.com/v1'

}

module.exports = config;