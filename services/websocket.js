const WebSocket = require("ws");

class WebSocketManager {
    constructor() {
        this.ws = null;
        this.subscriptions = []; // 현재 구독 중인 데이터
        this.eventHandlers = {}; // 각 메시지 타입별 이벤트 핸들러
    }

    // WebSocket 연결 시작
    startConnection() {
        if (this.ws) {
            console.warn("WebSocket already connected.");
            return;
        }

        this.ws = new WebSocket("wss://api.upbit.com/websocket/v1");

        this.ws.on("open", () => {
            console.log("WebSocket connected.");
            this.subscribeToMarkets(); // 초기 구독 설정
        });

        this.ws.on("message", (data) => {
            const parsedData = JSON.parse(data);
            const eventType = parsedData.type || "unknown";

            // 메시지 타입에 따른 이벤트 처리
            if (this.eventHandlers[eventType]) {
                this.eventHandlers[eventType](parsedData);
            } else {
                console.warn(`Unhandled WebSocket message type: ${eventType}`);
            }
        });

        this.ws.on("error", (error) => {
            console.error("WebSocket error:", error.message);
        });

        this.ws.on("close", () => {
            console.log("WebSocket closed. Reconnecting...");
            this.ws = null;
            setTimeout(() => this.startConnection(), 3000);
        });
    }

    // 구독 요청 설정
    subscribeToMarkets() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error("WebSocket is not ready.");
            return;
        }

        // 구독 요청 데이터 생성
        const subscriptionRequest = JSON.stringify([
            { ticket: "price-monitor" },
            ...this.subscriptions,
        ]);

        this.ws.send(subscriptionRequest);
        //console.log("Subscribed to markets:", this.subscriptions);
    }

    // 구독 항목 추가
    addSubscription(type, codes) {
        if (!Array.isArray(codes)) {
            codes = [codes];
        }

        this.subscriptions.push({ type, codes });
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.subscribeToMarkets(); // 새 구독 요청
        }
    }

    // 이벤트 핸들러 추가
    addEventHandler(type, handler) {
        this.eventHandlers[type] = handler;
    }

    // WebSocket 연결 종료
    closeConnection() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

module.exports = WebSocketManager;