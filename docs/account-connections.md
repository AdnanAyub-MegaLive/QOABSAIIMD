# Connect phone and Google to an existing account

Every endpoint below requires the existing Bearer mobile session. No linking endpoint issues an account or session. IDs, wallets, roles and agency relationships are unchanged. Subsequent phone/Google login uses the normal login endpoints and single-device session policy.

| Method | Endpoint | Body/result |
|---|---|---|
| GET | `/api/v1/users/me/connections` | `{googleConnected,phoneConnected,googleEmail,maskedPhone}` |
| GET | `/api/v1/users/me/connections/countries` | `{countries:[{country:"PK",name:"Pakistan",callingCode:"+92"},...]}` |
| POST | `/api/v1/users/me/connections/google` | `{idToken}` → connection status |
| POST | `/api/v1/users/me/connections/phone/request` | `{country:"PK",phone:"03001234567"}` → `{challengeId,expiresAt,delivery,maskedPhone}` |
| POST | `/api/v1/users/me/connections/phone/confirm` | `{challengeId,otp:"123456",password:"at-least-eight-characters"}` → connection status |

Responses use `{success:true,data:...}` or `{success:false,error:{code,message}}`, v1 headers and request ID. Never send a user ID. Country is the selected phone country, NOT a change to profile country. Use the returned country/calling-code list for the searchable mobile selector. Submit phone login using normalized international format (e.g. `+923001234567`). Full numbers and credentials are not returned in connection status.

Google tokens use the existing configured server OAuth audience, signature, issuer, expiry and verified-email validation. The server stores verified subject/email only. Matching an email during unauthenticated Google login now returns `GOOGLE_ACCOUNT_LINK_REQUIRED`; sign in to the existing account first and link explicitly. No automatic account merging. A different already-connected Google identity cannot be replaced by this operation.

Phone verification has a replaceable provider adapter. TEST mode uses 123456, sends no SMS and **does not prove phone ownership**. Development defaults to TEST; production defaults to DISABLED. Explicit `ACCOUNT_LINK_PHONE_VERIFICATION=TEST` enables temporary testing, including in production if deliberately chosen; do not treat it as real verification. Integrate a real SMS provider before claiming verified ownership. The request/confirm API stays unchanged when replacing the adapter. Never use this OTP for login or password reset.

Challenges expire after five minutes, are scoped to the authenticated account and session version, allow five incorrect attempts, and become consumed on success. Request a new code after expiry; resending invalidates the previous challenge, with a 60-second cooldown. Ten mutation requests per account per ten minutes are counted in PostgreSQL across workers/restarts. An additional per-IP limit applies. Repeating a successful confirm does not change the password or create a second audit entry.

Errors: `GOOGLE_ID_TOKEN_INVALID` (401), `GOOGLE_ID_TOKEN_REQUIRED` (422), `GOOGLE_ACCOUNT_ALREADY_CONNECTED` / `GOOGLE_ALREADY_CONNECTED` (409), `PHONE_INVALID` / `WEAK_PASSWORD` / `OTP_INCORRECT` / `OTP_EXPIRED` (422), `PHONE_ALREADY_CONNECTED_ELSEWHERE` / `PHONE_ALREADY_CONNECTED` (409), `OTP_ATTEMPTS_EXCEEDED` / `RATE_LIMITED` (429), `PHONE_VERIFICATION_UNAVAILABLE` (503), existing invalid/revoked-session/device/ban errors. Honor Retry-After. No session or token is returned by OTP verification.

Mobile profile PATCH can no longer change a phone number or a connected Google email. Unchanged values remain accepted. Link a missing phone through the new flow; changing an existing phone/password requires a separately designed recovery flow.

Deploy: apply `20261013130000_account_connections`, generate Prisma Client, rebuild and restart. Existing linked Google accounts get their current email copied into googleEmail; there are no changes to balances or phone values. Legacy phone normalization is not bulk-migrated. Test with real Google tokens and two separate accounts on staging before release. Mobile UI work and SMS-provider integration are not part of this portal change.
