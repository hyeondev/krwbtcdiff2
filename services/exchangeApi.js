const fetchJSON = require('./upbitApi'); // 분리된 fetchJSON 모듈 불러오기
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config'); // config.js 파일에 딜레이 설정 포함
const fs = require("fs");

// Upbit API Keys
let accessKey = "YOUR_ACCESS_KEY"; // Upbit에서 발급받은 Access Key
let secretKey = "YOUR_SECRET_KEY"; // Upbit에서 발급받은 Secret Key

let token;

// info.txt에서 API 키 로드
function loadAPIKeys() {
    try {
      const data = fs.readFileSync("info.txt", "utf-8");
      const lines = data.split("\n");
      const accessKeyLine = lines.find((line) => line.startsWith("access_key"));
      const secretKeyLine = lines.find((line) => line.startsWith("secret_key"));
  
      if (!accessKeyLine || !secretKeyLine) {
        throw new Error("access_key 또는 secret_key가 파일에 존재하지 않습니다.");
      }
  
      accessKey = accessKeyLine.split(":")[1]?.trim();
      secretKey = secretKeyLine.split(":")[1]?.trim();
    
      if (!accessKey || !secretKey) {
        throw new Error("access_key 또는 secret_key가 올바르게 설정되지 않았습니다.");
      }
  
      console.log("API 키가 성공적으로 로드되었습니다.");
    } catch (err) {
      console.error("API 키 파일을 읽는 중 오류가 발생했습니다:", err);
      process.exit(1);
    }
  }

// JWT 토큰 생성 함수
function generateJWT() {
    const payload = {
        access_key: accessKey,
        nonce: uuidv4(), // 고유 식별 값
    };
    return jwt.sign(payload, secretKey);
}

// 초기화 함수
function initialize() {
    loadAPIKeys();
    console.log("Initialization logic -> loadAPIKeys() done.");
    // 초기화에 필요한 작업 수행
}

// 초기화 실행
initialize();

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
            //console.log("Account Information:", accounts);
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

module.exports = {
    getAccountInfo
};