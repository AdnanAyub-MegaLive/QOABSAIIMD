# Live-only gifts, settlement and target rewards

Manage exclusively from Live Management → Gifts & Income and Live Rules & Rewards.
The existing `video.view` / `video.manage` permissions apply. General upload edit
and delete operations reject LIVE_GIFTS assets. Audio GIFTS remain unchanged.

## Mobile contract

- GET `/api/v1/live-video/gifts` with Bearer authentication returns
  `{success:true,data:{gifts:[{id,publicId,name,category,mimeType,coinPrice,mediaUrl}]}}`.
- Send using existing POST `/api/gifts/send` with `liveId`, host `recipientId`,
  live-catalogue `giftId`, quantity and an `Idempotency-Key`. Audio gifts no longer
  qualify for live sends. Live gifts do not qualify for audio or direct sends.
- GET `/api/v1/live-video/{liveId}/rewards` is host-only and returns `ruleVersion`,
  `enabled`, `targetCoins`, `eligibleGiftCoins`, `rewardCoins`, `paid` inside data.
  All coin amounts are decimal strings. Rewards credit automatically; no claim
  endpoint or client-calculated awards.

## Rules

Live settlement has a separate versioned rule row, initially 40% host, 20% agency,
40% company (independent of future audio policy edits). Existing host agency
requirements remain. The management form requires these shares to total 100%.
Settlement records persist the applied percentages and version. Changes apply to
subsequent sends; previously settled gifts are not recalculated.

Rewards start disabled. Set target coins and reward coins, then enable them.
Each new live snapshots its target, reward and rule version. Existing lives keep
their terms; pre-migration lives do not receive retroactive rewards. One reward
per live session, credited to the host coin wallet when committed non-self gift
spending reaches the target. This is gross paid gift value, not salary/diamonds.
No audio gifts, self-gifts, backpack gifts, lucky rewards or generic daily-task
progress count toward the live coin-reward target. Live sends now award shared
User/Charm XP using per-gift settings (see gift-xp.md), but not SEND_GIFTS /
TOP_SUPPORTER daily progress. Wallet/gift/reward mutations share a serializable
transaction with bounded retries and request idempotency. A conditional paid
marker prevents multiple reward credits. Ledger type: LIVE_TARGET_REWARD.

Live artwork upload currently supports PNG/JPEG/WebP up to 5 MB, decoded and
re-encoded as WebP with metadata stripped. Animated gift upload is not included.
No existing gift artwork is copied or recategorized automatically.

Deployment: apply migrations, regenerate Prisma and restart the server. Mobile
must switch its live gift picker to the new catalogue before rollout. Test with
`node scripts/test-live-commerce-db.mjs` (fixtures rolled back). This change does
not add refund-driven reward clawbacks; any future gift refund workflow must
define and implement that policy before use.
