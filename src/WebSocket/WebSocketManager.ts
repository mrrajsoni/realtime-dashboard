import {apiFetch} from '@/Auth/apiFetch';
import {authManager} from '@/Auth/AuthManager';
import {refreshAccessToken} from '@/Auth/refreshAccessToken';
import {TMetricData} from '@/types.definitions';

class WebSocketManager {
  private socket: WebSocket | null = null;
  private listeners: Map<string, (data: TMetricData) => void>;
  private connectionAttempts: number;
  private retryOnRefreshAttempts: number;
  private requestedTicket: Promise<void> | null;

  constructor() {
    this.listeners = new Map<string, (data: TMetricData) => void>();
    this.connectionAttempts = 0;
    this.retryOnRefreshAttempts = 0;
    this.requestedTicket = null;
  }

  public async connect(): Promise<void> {
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    if (!authManager.getAccessToken()) {
      return;
    }

    // if one caller already requested for the ticket, make it adopt the same promise
    if (this.requestedTicket) {
      return this.requestedTicket;
    }

    this.requestedTicket = (async () => {
      try {
        const response = await apiFetch('/api/ws-ticket', {
          method: 'POST',
        });
        const {ticket} = await response.json();

        if (
          !ticket ||
          this.socket?.readyState === WebSocket.CONNECTING ||
          this.socket?.readyState === WebSocket.OPEN
        )
          return;

        const socket = new WebSocket(`ws://localhost:8080?ticket=${ticket}`);
        this.socket = socket;

        socket.onopen = () => {
          this.reset();
          this.listeners.forEach((_, key) => {
            if (key) {
              socket.send(key);
            }
          });
        };

        socket.onmessage = (event: MessageEvent) => {
          const parsedJson = JSON.parse(event.data) as TMetricData;
          this.listeners.get(parsedJson.metricName)?.(parsedJson);
        };

        socket.onclose = async (event) => {
          const code = event.code;
          const isServerError = code === 1011;
          const isAuthorizationError = code === 4401;
          if (isServerError) {
            this.onClose();
            return;
          }

          if (isAuthorizationError && this.retryOnRefreshAttempts < 1) {
            this.retryOnRefreshAttempts += 1;
            try {
              await refreshAccessToken();
            } catch {
              return;
            }
            this.connect();
            return;
          }

          this.onClose();
        };

        socket.onerror = (event) => {
          console.error('WebSocket Error:', event);
          this.onError();
        };
      } catch (error) {
        console.error('Failed to establish WebSocket ticket/connection:', error);
      } finally {
        this.requestedTicket = null;
      }
    })();

    return this.requestedTicket;
  }

  public subscribe(metricName: string, callBack: (data: TMetricData) => void) {
    this.listeners.set(metricName, callBack);
    if (!this.socket) this.connect();

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
