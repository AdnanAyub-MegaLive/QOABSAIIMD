# Live Management

The sidebar's Live Management entry opens `/live-management` and replaces the
Live Video tab previously under Room Management. The old URL redirects.

Tabs: Live Sessions, Hosts & KYC, Gifts & Income, Live Rewards, PK & Guests.
Session operations keep `video.view`/`video.manage`; host records additionally
require `hosts.view`, and rewards require `tasks.view`/`tasks.manage`.
Shared gift assets, finance and settlement editors retain their existing
permissions and are linked from Gifts & Income rather than duplicated.

## Mandatory host verification

Starting/reopening live video and requesting the host LiveKit token both reload
the account from the database. The account must be active, not deleted, have
the HOST role, and have `isVerified=true`. This uses the existing verification
approval model (also used by wallet KYC), not a new document-verification service.
Failures return HTTP 403 with `LIVE_HOST_REQUIRED` or `LIVE_KYC_REQUIRED`.
Viewers and approved guest slots are unchanged. Existing issued media tokens are
not revoked retroactively by this change. Audio-room eligibility is unchanged.

Live Rewards edits existing LIVE_ task definitions through the shared task
configuration API. It does not create a new payout engine or invent reward rates.
The mobile app should show the KYC error and direct the host to verification.
