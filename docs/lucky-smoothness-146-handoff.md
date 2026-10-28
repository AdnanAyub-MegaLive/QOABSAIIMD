# Lucky combo smoothness — backend and app handoff

Status: local implementation, not deployed or measured on real devices.

Backend changes:
- Single-send recipient accounting now precedes the shared Lucky pool lock.
- Multi-send prepares all recipient accounting before acquiring that lock.
- Existing pools use one locking balance read and one write. Multi-recipient
  batches execute their separate draws in input order against a running balance
  and save the aggregate pool change once, rather than once per recipient.
- Contribution, affordable-outcome fallback, odds and payouts remain unchanged.
- Per-sender scheduling, idempotency, transaction rollback, recovery snapshots
  and post-commit outbox delivery remain in place.
- Serializable remains: progression read/modify/write totals are not safe to
  downgrade to ReadCommitted without further concurrency changes.

This reduces lock-held work; it does not eliminate the shared pool lock, shared
receiver contention or guarantee a latency target. Reward-dependent XP, recovery
and event persistence still occur before transaction commit.

App requirements (mobile source is not in this repository):
- Keep sending independent of animation playback. No room-wide animation/send
  busy flag, including when another sender's animation is visible.
- Use separate combo state by sender and combo identity. Maintain one active
  animation/display for each combo, updating its count and confirmed returns.
- Extend its deadline on newer combo updates; never shorten it on older events.
- Stop at the deadline and discard expired visual playback, not accounting.
- Deduplicate using event/transaction IDs, not batch/request IDs shared across
  distinct gifts. Same batch does not mean same charge.
- Do not display unconfirmed Lucky returns as successful. Failed sends should
  not inflate the confirmed combo count or balance.
- Limit concurrent visual layers and coalesce rendering; do not queue 50 full
  animations. Coalescing visuals must not drop gift receipts or ledger records.

Acceptance still required: five dedicated QA senders, 50 committed taps each,
different and shared recipients, insufficient balances, duplicate retries and
normal gifts alongside Lucky. Record request/commit/event receipt timestamps,
retry counts, wallet deltas, per-gift returns and pool conservation. Verify two
phones can send while receiving. No production accounts were changed for this
implementation, and no 250-gift performance result is claimed.
