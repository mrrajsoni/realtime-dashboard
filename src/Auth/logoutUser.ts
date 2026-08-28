export function logoutUser() {
  return fetch('/api/auth/logout', {method: 'POST'}).then((response) => {
    // A 401/500 body is still valid JSON, so without this check a failed logout
    // flows into the success path and gets reported to the user as success.
    if (!response.ok) {
      throw new Error('LogoutFailed');
    }

    return response.json();
  });
}
