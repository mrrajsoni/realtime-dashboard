import {TMetricData} from '@/types.definitions';

class WebSocketManager {
  private socket: WebSocket | null = null;
  private listeners: Map<string, (data: TMetricData) => void>;
  constructor() {
    this.listeners = new Map<string, (data: TMetricData) => void>();
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

  public onClose() {}
}

export const webSocketManager = new WebSocketManager();
