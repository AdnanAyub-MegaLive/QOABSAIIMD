# Mobile API and Socket.IO production deployment

## One public origin

The Android application uses one public portal origin for both REST and
Socket.IO. For example:

```text
PORTAL_API_BASE_URL=https://portal.example.com/
PORTAL_SOCKET_BASE_URL=https://portal.example.com
SOCKET_PATH=/socket.io/
```

The exact hostname is a deployment decision. Do not hard-code a local IP
address, `localhost`, or an old backend hostname into an Android release build.

## Portal production configuration

Set the following in the production host's secret/environment manager. Do not
commit production values.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Production PostgreSQL connection. |
| `AUTH_SECRET` | Yes | Signs portal mobile sessions. Use a strong unique value. |
| `MOBILE_SESSION_TTL_SECONDS` | No | Portal session lifetime; defaults to 30 days. |
| `GEOLOCATION_REQUIRED` | Yes in production | Requires a trusted country result for every registration. |
| `TRUST_PROXY_GEO_HEADERS` | Yes in production | Allows country headers only after the proxy has removed client-supplied copies and set its own value. |
| `LIVEKIT_URL` | Yes | Public `wss://` LiveKit endpoint. |
| `LIVEKIT_API_KEY` | Yes | Server-only LiveKit API key. |
| `LIVEKIT_API_SECRET` | Yes | Server-only LiveKit signing secret. |
| `LIVEKIT_TOKEN_TTL_SECONDS` | No | Token lifetime; defaults to 600 seconds. |
| `MOBILE_API_BASE_URL` | Yes | Canonical public HTTPS portal origin, without a trailing slash. |
| `MOBILE_APP_ORIGIN` | Yes for browser clients | Explicit web origin allowed by CORS; native Android requests do not use browser CORS. |
| `PORT` | Yes | Internal custom-server port, normally `3000`. |

Use [`.env.example`](../.env.example) only as a non-secret template for local
development. `.env.local` remains ignored by Git.

## Reverse proxy and TLS requirements

The custom server hosts Next.js and Socket.IO together. Configure the reverse
proxy/load balancer to:

1. Terminate TLS and redirect HTTP to HTTPS.
2. Forward normal requests to the Node server port.
3. Forward `/socket.io/` with WebSocket upgrade headers and a long enough idle
   timeout for persistent mobile connections.
4. Set `X-Forwarded-Proto` and `X-Forwarded-Host` so generated public asset
   URLs use the HTTPS public hostname.
5. Use one stable hostname for API and Socket.IO unless a separate socket host
   is deliberately configured in the Android build.
6. Resolve the registration IP to an ISO alpha-2 country, remove any
   client-supplied `CF-IPCountry`, `X-Vercel-IP-Country`, and `X-Geo-Country`
   headers, then forward exactly one trusted geo-country header to Node.

Do not enable clear-text HTTP for the Android production build.

## Readiness check for Android

Before login, the app or release smoke test can call:

```http
GET /api/health
```

A ready portal returns its canonical endpoints:

```json
{
  "success": true,
  "data": {
    "status": "ready",
    "apiBaseUrl": "https://portal.example.com",
    "socketBaseUrl": "https://portal.example.com",
    "socketPath": "/socket.io/"
  }
}
```

`503 DATABASE_UNAVAILABLE` means the deployment is reachable but should not
accept mobile traffic yet.

## Android build configuration

Keep the base URL in each build variant rather than in source code:

```kotlin
buildConfigField("String", "PORTAL_API_BASE_URL", "\"https://portal.example.com/\"")
buildConfigField("String", "PORTAL_SOCKET_BASE_URL", "\"https://portal.example.com\"")
```

The Android client sends the portal session token in the REST `Authorization`
header and as the Socket.IO handshake token. See
[mobile-api-v1.md](mobile-api-v1.md) and
[android-portal-integration-handoff.md](android-portal-integration-handoff.md)
for the rest of the integration sequence.
