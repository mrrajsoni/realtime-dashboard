import {apiFetch} from '@/Auth/apiFetch';
import {authManager} from '@/Auth/AuthManager';
import {refreshAccessToken} from '@/Auth/refreshAccessToken';
import {TMetricData} from '@/types.definitions';

class WebSocketManager {
  private socket: WebSocket | null = null;
  private listeners: Map<string, (data: TMetricData) => void>;
  private connectionAttempts: number;
  private retryOnRefreshAttempts: number;
  private requestedTicket: Promise<{ticket: string}> | null;

  constructor() {
    this.listeners = new Map<string, (data: TMetricData) => void>();
    this.connectionAttempts = 0;
    this.retryOnRefreshAttempts = 0;
    this.requestedTicket = null;
  }

  public async connect() {
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    )
      return;

    if (!authManager.getAccessToken()) {
      return;
    }

    if (this.requestedTicket) {
      return this.requestedTicket;
    }

    this.requestedTicket = apiFetch('/api/ws-ticket', {
      method: 'POST',
    })
      .then((value) => {
        return value.json();
      })
      .catch(() => {
        this.requestedTicket = null;
      });

    const {ticket} = await this.requestedTicket;
    if (!ticket) {
      this.requestedTicket = null;
      return;
    }

    this.socket = new WebSocket(`ws://localhost:8080?ticket=${ticket}`);
    this.requestedTicket = null;

    this.socket.onopen = () => {
      this.reset();
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

    this.socket.onclose = async (event) => {
      const code = event.code;
      if (code === 4401 && this.retryOnRefreshAttempts < 1) {
        this.retryOnRefreshAttempts += 1;
        await refreshAccessToken();
        this.connect();
        return;
      }
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

  public closeConnection() {
    this.socket?.close(1000);
    this.socket = null;
    this.reset();
  }

  public reset() {
    this.connectionAttempts = 0;
    this.retryOnRefreshAttempts = 0;
    this.requestedTicket = null;
  }
}

export const webSocketManager = new WebSocketManager();
