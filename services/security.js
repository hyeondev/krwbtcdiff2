const fetchJSON = require('./upbitApi'); // 분리된 fetchJSON 모듈 불러오기
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config'); // config.js 파일에 딜레이 설정 포함
const fs = require("fs");
const crypto = require('crypto');
const queryEncode = require("querystring").encode

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

// JWT 토큰 생성 함수
function generateOrderJWT(body) {
  const query = queryEncode(body)
  const hash = crypto.createHash('sha512')
  const queryHash = hash.update(query, 'utf-8').digest('hex')

  const payload = {
      access_key: accessKey,
      nonce: uuidv4(), // 고유 식별 값
      query_hash: queryHash,
      query_hash_alg: "SHA512",
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

module.exports = {
    generateJWT, generateOrderJWT

};