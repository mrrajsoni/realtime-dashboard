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

const callRefreshAccessToken = async () => {
  try {
    const token = await refreshAccessToken();
    return token;
  } catch (error) {
    if (error instanceof Error && error.message === 'ServiceUnavailable') throw error; // no notify
    authManager.notifySessionExpired();
    throw new Error('AuthExpired');
  }
};

export const apiFetch = async (url: string, options?: RequestInit): Promise<Response> => {
  let token = authManager.getAccessToken();
  if (!token) {
    token = await callRefreshAccessToken();
  }

  const response = await fetch(url, withAuthHeader(token, options));

  if (response.status !== 401) {
    return response;
  }
  //retry once
  token = await callRefreshAccessToken();

  const retryResponse = await fetch(url, withAuthHeader(token, options));

  if (retryResponse.status === 401) {
    authManager.notifySessionExpired();
    throw new Error('AuthExpired');
  }

  return retryResponse;
};
