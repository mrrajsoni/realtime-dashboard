import {authManager} from './AuthManager';
import {refreshAccessToken} from './refreshAccessToken';

// Small helper so you build the Authorization header in ONE place instead of
// duplicating the spread three times. Takes the token, returns the options.
function withAuthHeader(token: string, options?: RequestInit): RequestInit {
  return {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: 'Bearer ' + token,
    },
  };
}

export const apiFetch = async (url: string, options?: RequestInit): Promise<Response> => {
  let token = authManager.getAccessToken();
  if (!token) {
    token = await refreshAccessToken();
  }

  const response = await fetch(url, withAuthHeader(token, options));

  if (response.status !== 401) {
    return response;
  }

  const newToken = await refreshAccessToken();

  const retryResponse = await fetch(url, withAuthHeader(newToken, options));

  if (retryResponse.status === 401) {
    authManager.notifySessionExpired();
    throw new Error('AuthExpired');
  }

  return retryResponse;
};
