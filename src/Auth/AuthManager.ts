class AuthManager {
  private accessToken: string | null = null;
  private listeners: Map<string, () => void> = new Map();

  public setAccessToken(token: string) {
    this.accessToken = token;
  }

  public getAccessToken() {
    return this.accessToken;
  }

  public clearAccessToken() {
    this.accessToken = null;
  }

  public notifySessionExpired() {
    this.clearAccessToken();
    this.listeners.forEach((cb) => {
      cb();
    });
  }

  public subscribe(subsciberKey: string, callBack: () => void) {
    this.listeners.set(subsciberKey, callBack);
    return () => {
      this.listeners.delete(subsciberKey);
    };
  }
}

export const authManager = new AuthManager();
