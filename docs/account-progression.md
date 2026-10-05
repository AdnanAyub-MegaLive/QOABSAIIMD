# User and Charm progression — implementation status

## Safe rollout

Awards are DISABLED. Migration creates only level 0 with zero points for USER and CHARM. No legacy/example conversion rates, thresholds, rewards, or opening totals have been assumed. VIP and room rankings remain separate.

Rules & Profit Split → User & Charm progression provides a permission-protected versioned configuration editor. Publishing requires `rules.manage`, validates increasing thresholds, integer rational rates, active uploaded badge references and plain-text display benefits, and audits the new version. Existing earning accounts remain pinned to their configuration; changing the active version does not reinterpret history. Publishing a disabled active version pauses awards globally. Benefits are display text, not automatic entitlements.

## Delivered

- Progression configuration, level definitions, per-user track summaries, unique-source ledger, sender-scoped gift requests and transactional realtime outbox.
- GET `/api/me/progression`, `/api/levels?track=USER|CHARM&version=`, `/api/me/progression/history?track=&limit=&cursor=` and equivalent `/api/v1/...` routes. Bearer authentication and existing ban/device checks apply. BigInt amounts serialize as decimal strings.
- Paid, lucky, blind-box and backpack gift paths integrate progression in their wallet/inventory transaction. Rules separately select COST, CREDIT, REWARD or REVEALED basis where applicable, with explicit self-gift eligibility. Talent-only recipients receive no account Charm until mapping is approved.
- `Idempotency-Key` (8–128 ASCII letters/digits or `._:-`) is scoped to sender and fingerprints route mode, gift, recipients, quantity, room/live and grouping identifiers. Same key/payload replays the saved result. Conflicting payload gives 409 IDEMPOTENCY_CONFLICT. Clients without a key remain compatible but cannot obtain retry protection. giftBatchId is not an idempotency key.
- Multi-send uses an atomic sender request and per-recipient progression rounding. Its existing requestId is an idempotency fallback. Multi-send currently allows classic/premium/VIP gifts only; lucky/blind-box multi-send needs a defined reward distribution contract.
- Gift and progression events are queued transactionally and published after commit. Outbox delivery can repeat: deduplicate eventId and ignore older progression revisions. Offline recovery is REST, not a promise of socket delivery. Private totals/history are never added to room gift events.
- Common profile/member/chat/gift serializers expose public User/Charm levels and badge URLs; equipped badges and VIP remain independent.

## Still required before full release

- Approved thresholds, earning rates, recipient eligibility and self-gift rules.
- Approved refund/downgrade policy and reversal execution (reversal reference schema is present, no refund endpoint is added).
- Rewards/grant policy and implementation; no wallet rewards are generated.
- Verified legacy totals/export, mapping, cutover timestamp, rerunnable importer and reconciliation. No backfill from totalSpent was performed.
- Explicit migration tool for moving existing accounts between configuration versions.
- Complete identity-payload audit (including every legacy login/seat variant), multi-send per-recipient event compatibility, and end-to-end device tests.
- Broader fault-injection/concurrent gift testing and production outbox monitoring/retention. Keep awards disabled until rollout checks pass.

## Verification

`npm test`; `node scripts/test-progression-db.mjs` (all fixtures and temporary enabled rules are rolled back). Production build succeeds with the existing unrelated events-storage tracing warning. These local checks are not a production deployment or financial reconciliation sign-off.
