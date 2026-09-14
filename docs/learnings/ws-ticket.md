We store the random UUID generated using crypto.randomUUID() in the redis key.
We then call the endpoint /ws-ticket -> use atomic operation using redis's getdel method which returns the UUID value that we stored.
The ticket is valid for 10 seconds, so that any connection request that comes after 11 seconds of the ticket generation will be rejected.
We close the connection immediately with 4401 error code if the ticket is invalid.
We handle different error codes differently, if there is a server error like 1011 we don't try to call the refreshToken API because there is a possibility that might also fail due to the same thing. So we simply do the retry with the same token with the exponential delay until 3 attempts.
If there is a Auth Expiry error from the refreshToken call then we simply return the function execution and let AuthGate handle the redirection.
Moved the entire one ticket one socket connection into a whole flow so no other caller creates two socket connection when the socket is in connecting or in open state already.
