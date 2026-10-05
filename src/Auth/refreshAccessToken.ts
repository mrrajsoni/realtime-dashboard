import {authManager} from './AuthManager';

let pendingRefresh: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  if (pendingRefresh) {
    return pendingRefresh;
  }

  // ---------------------------------------------------------------
  pendingRefresh = fetch('/api/auth/refresh', {method: 'POST'})
    .then((response) => {
      if (response.status === 401) {
        throw new Error('AuthExpired');
      }
      if (response.status === 503) {
        throw new Error('ServiceUnavailable');
      }
      if (!response.ok) throw new Error('ServiceUnavailable');

      return response.json();
    })
    .then((body) => {
      const accessToken = body.accessToken as string;
      authManager.setAccessToken(accessToken);
      return accessToken;
    })
    .finally(() => {
      pendingRefresh = null;
    });

  return pendingRefresh;
}
