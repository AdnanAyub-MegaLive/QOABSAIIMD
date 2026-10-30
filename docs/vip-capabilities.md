# VIP runtime contract (156)

Only the selected membership grants capabilities. It must have started, be unexpired and unrevoked, and belong to an active tier. Numeric `User.vipLevel`, owned but unselected tiers, cached artwork, and client claims never authorize a server action.

- Room owners and separately authenticated Portal staff retain kick/ban/mute authority. Ordinary room admins cannot kick or ban `ANTI_KICK` users, or force-mute/unseat `ANTI_MIC_BAN` users. Bulk clear fails before changing any seat if it contains a protected member. Platform bans and safety controls remain available.
- `ROOM_ANTI_LOCK` bypasses room passwords and seat locks. It cannot bypass occupied seats, bans, owner-only admissions, terminated/blocked rooms, or paid admission.
- `INVISIBLE_ENTRY` suppresses entrance effects and public membership join/leave notifications. Public member pages omit the user before pagination. Owner/admin views include the user. Joining invisibly is not anonymous speaking, gifting or chatting: deliberate public activity and occupied seats still identify the participant. Profile room-presence hints are suppressed.
- `FORBIDDEN_FOLLOW` rejects new follow requests; existing followers are not deleted and unfollow remains allowed.
- `RANKING_PRIORITY`: score descending always wins. Within personal score ties, opted-in active VIPs sort by tier level descending, then stable identity (public ID for event/global/legacy gift rankings; canonical account ID for room/hourly snapshot rankings). Member lists use VIP tier descending, then join time ascending, then public ID ascending. VIPs without the privilege receive no tie advantage. Collective Agency/CP and game result ranking rules are unchanged.
- `LEVEL_BOOST`: configurable `xpMultiplierBps`, 10000–100000 (1×–10×), default 1×. Applies only to User/Wealth gift XP, not Charm, agency/game XP or money. Integer division rounds down once after multiplying. The existing unique gift/track ledger key prevents duplicate awards; `vipMultiplierBps` records the applied factor and reversals use the recorded XP delta. Existing awards are not recalculated.
- `GIF_ROOM_COVER`: the uploading user must have the privilege. Existing covers are not deleted on expiry. Other room background/banner/personal-cover capabilities are separate.
- `HIGHLIGHT_NAME`: `vipNameColor` is the tier's six-digit `nameColor`, default #D946EF, only while the privilege is active.
- `CUSTOMER_SERVICE`: direct conversations involving a CS/CS_LEADER and a current priority VIP are marked **Priority VIP support** in Portal message history; the app exposes a priority support chat button. This does not promise an agent response time or create new staff powers.
- `EVENT_CUSTOMIZATION` is reserved for staff-assisted event theme/artwork requests. The checkbox grants no event publishing, scoring, payout or automatic customization powers. A submission/approval workflow needs a separate product spec before implementation.

## Verification

`npm test` includes expiry, revocation, future starts, disabled tiers, owner/admin protection, invisible presence routing, ranking, support priority and XP idempotency tests.

`node scripts/test-vip-capabilities.mjs` creates a disposable database and runs real authenticated HTTP/Socket.IO joins and moderation requests. It verifies invisible join delivery, password/seat bypass, member visibility, admin rejection, follow rejection and GIF rejection.

After deployment, `node scripts/test-vip-capabilities.mjs --deployed` repeats against the configured server using temporary private zero-balance QA accounts and a password room. It removes its records afterward; no existing users' memberships or balances are changed. Do not print session tokens or database credentials.
