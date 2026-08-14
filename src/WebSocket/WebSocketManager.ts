import {TMetricData} from '@/types.definitions';

class WebSocketManager {
  private socket: WebSocket | null = null;
  private listeners: Map<string, (data: TMetricData) => void>;
  private connectionAttempts: number;
  constructor() {
    this.listeners = new Map<string, (data: TMetricData) => void>();
    this.connectionAttempts = 0;
  }

  public connect() {
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    )
      return;
    this.socket = new WebSocket('ws://localhost:8080');

    this.socket.onopen = () => {
      this.listeners.forEach((_, key) => {
        if (key) {
          this.socket?.send(key);
        }
      });
    };

    this.socket.onmessage = (event: MessageEvent) => {
      const parsedJson = JSON.parse(event.data) as TMetricData;
      this.listeners.get(parsedJson.metricName)?.(parsedJson);
    };

    this.socket.onclose = () => {
      this.onClose();
    };

    this.socket.onerror = (event) => {
      console.error('WebSocket Error:', event);
      this.onError();
    };
  }

  public subscribe(metricName: string, callBack: (data: TMetricData) => void) {
    if (!this.socket) this.connect();
    this.listeners.set(metricName, callBack);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(metricName);
    }
    return () => {
      this.listeners.delete(metricName);
    };
  }

  public onClose() {
    if (
      this.socket &&
      this.socket.readyState !== WebSocket.OPEN &&
      this.socket.readyState !== WebSocket.CONNECTING
    ) {
      this.connectionAttempts += 1;
      const delay = Math.min(this.connectionAttempts * 1000, 30000);
      setTimeout(() => {
        this.connect();
      }, delay);
    }
  }

  public onError() {
    if (this.connectionAttempts < 4) {
      this.onClose();
      return;
    }
    console.error('Connection failed after 4 attempts');
  }
}

export const webSocketManager = new WebSocketManager();
