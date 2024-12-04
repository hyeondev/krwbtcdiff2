//REST api 모듈
const axios = require('axios');
const request = require('request');
const config = require('../config/config');
const queryEncode = require("querystring").encode
const { generateJWT, generateOrderJWT } = require("./security");

let dynamicDelay = config.baseDelay; // 기본 요청 간격(ms)

// 딜레이 함수
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 업비트 API 호출 함수 (동적 딜레이 조정 포함)
async function fetchJSON(url, headers = {}) {
  await delay(dynamicDelay); // 요청 간 딜레이 적용
  try {
    // 요청 전송
    const response = await axios.get(url, { headers });
    // Remaining-Req 확인 및 동적 딜레이 조정
    adjustDynamicDelay(response.headers['remaining-req']);

    return response.data;
  } catch (error) {
    console.error(`Failed to fetch ${url}:`, error.message);
    return null;
  }
}

// 동적 딜레이 조정 로직을 별도 함수로 분리
function adjustDynamicDelay(remainingReq) {
  if (remainingReq) {
    const match = remainingReq.match(/group=(.+); min=(\d+); sec=(\d+)/);
    if (match) {
      const [, , , sec] = match;
      if (parseInt(sec) < 2) {
        dynamicDelay = config.lazyDelay; // 요청 간격을 늘림
        console.log(`Low remaining requests, increasing delay to ${dynamicDelay}ms`);
      } else {
        dynamicDelay = config.baseDelay; // 기본 요청 간격으로 복구
      }
    }
  }
}

// 모든 코인 마켓 가져오기
async function getAllMarkets() {
  try {
    const data = await fetchJSON(config.baseUrl + "/market/all");
    return data;
  } catch (error) {
    console.error("Error fetching market list:", error.message);
    return [];
  }
}

async function getAccountInfo() {
  const url = config.baseUrl + "/accounts";

  // 헤더 설정
  token = generateJWT();
  const headers = {
      Authorization: `Bearer ${token}`,
  };

  // API 요청
  try {
      const accounts = await fetchJSON(url, headers); // fetchJSON 함수 사용
      if (accounts) {
          // console.log("Account Information:", accounts);
          return accounts;
      } else {
          console.error("Failed to fetch account information.");
          return null;
      }
  } catch (error) {
      console.error("Error fetching account information:", error.message);
      throw error;
  }
}

// 매수 API
async function placeBuyOrder(market, price, volume) {
  const url = config.baseUrl + "/orders";
  // const volume = total_price / price;
  try {
      //await delay(dynamicDelay); // 요청 간 딜레이 적용
      const body = {
        market: market, 
        side: "bid",
        volume: volume,
        price: price,
        ord_type: "limit", // 지정가 주문
      };
      const token = generateOrderJWT(body);
      const response = await axios.post(
          url,
          body,
          {
              headers: {
                  Authorization: `Bearer ${token}`,
              },
          }
      );
      return response.data; // 주문 결과 반환
  } catch (error) {
      console.error(`[매수 실패 in placeBuyOrder] ${error.message} ${error.name}`);
      throw error;
  }
}

// 매도 API
async function placeSellOrder(market, price, volume) {
  const url = config.baseUrl + "/orders";
  // const volume = total_price / price;

  try {
      // await delay(100); // 요청 간격을 지키기 위해 딜레이 추가
      const body = {
        market: market, 
        side: "ask",
        volume: volume,
        price: price,
        ord_type: "limit", // 지정가 주문
      };
      const token = generateOrderJWT(body);
      const response = await axios.post(
          url,
          body,
          {
              headers: {
                  Authorization: `Bearer ${token}`,
              },
          }
      );
      return response.data; // 주문 결과 반환
  } catch (error) {
      console.error(`[매도 실패] ${error.response?.data?.error || error.message}`);
      throw error;
  }
}

// 주문 취소
async function placeCancelOrder(uuid) {
  const body = { uuid: uuid }; // 요청 데이터
  const query = queryEncode(body); // 쿼리 문자열 생성
  const url = `${config.baseUrl}/order?${query}`; // API URL 생성

  try {
    // JWT 토큰 생성
    const token = generateOrderJWT(body);

    // axios 요청 옵션
    const options = {
      method: "DELETE",
      url: url,
      headers: { Authorization: `Bearer ${token}` },
      data: body, // DELETE 메서드에서 데이터 전송
    };

    // axios 요청
    const response = await axios(options);
    return response.data;
  } catch (error) {
    console.error(`[취소 실패] ${error.response?.data?.error || error.message}`);
    throw error; // 에러 다시 던지기
  }
}

// 주문 상태 확인 API
async function checkOrderStatus(uuid) {
  const url =  config.baseUrl + `/order?uuid=${uuid}`;
  const token = generateJWT();

  try {
      const response = await fetchJSON(url, {
          Authorization: `Bearer ${token}`,
      });
      return response; // 주문 상태 반환
  } catch (error) {
      console.error(`[주문 상태 확인 실패] ${error.response?.data?.error || error.message}`);
      throw error;
  }
}


module.exports = { getAllMarkets, getAccountInfo, placeBuyOrder, placeSellOrder, checkOrderStatus, placeCancelOrder };
