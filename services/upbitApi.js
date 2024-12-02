//REST api 모듈
const axios = require('axios');
const config = require('../config/config');
const { generateJWT } = require("./security");

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

module.exports = { getAllMarkets, getAccountInfo };
