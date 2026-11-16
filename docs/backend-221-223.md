# Room Diamonds, game winnings, reactions and seat cancellation

Implemented against portal 8189427 and Kotlin_RN 6b894be. Stories and the Party-country proposal are excluded.

## Contracts

- `audio-room:gift-totals` and the opening snapshot retain coin fields and add each recipient's `receivedGiftDiamonds` as an exact decimal string. It is the lifetime room total from recorded gift credits, not current wallet balance or today's configured exchange rate.
- Historical Diamonds use completed `GIFT_RECEIVED` wallet credits, falling back to the settlement's recorded `recipientDiamonds`. Reversals and source edits/deletions produce compensating deltas. Unknown nonzero historical credits abort the migration for reconciliation instead of inventing a value. Gift and wallet balances are never changed by the migration.
- A per-gift projection prevents the wallet and settlement triggers from counting the same gift twice. Gift transactions append transaction-local deltas; the existing presentation worker folds them without holding a shared room lock in gift settlement.
- New qualifying `GAME_WIN` announcements persist `details.totalWinningsCoins`. This sums positive net profits per fully settled Coin round; losing rounds, unfinished rounds and practice points are excluded. Dispatch retries reuse the persisted value. A user-first index bounds history scans to that winner.
- `POST /api/v1/conversations/{conversationId}/messages/{messageId}/reactions` accepts `{ "emoji": "❤️" }`; insertion is idempotent per message/user/emoji. `DELETE` optionally accepts `?emoji=…`; no emoji removes all the current user's reactions for compatibility with the current app. Conversation membership, blocks and message deletion are checked. Country/World chat is outside this direct/group-chat feature.
- History, sync and personalized `message:updated` events include `reactions: [{emoji,count,mine}]`. Delivery uses the existing durable outbox. Message/user deletion removes associated reactions.
- `audio-room:seat-invite-cancel` accepts `{roomId,invitationId}` and requires a present seat moderator. Only `PENDING` invitations change to `CANCELLED`; acceptance and cancellation share a compare-and-set gate. Retries of a cancelled invite succeed. The target and inviter receive `audio-room:seat-invite-cancelled` immediately.
- Kotlin adds **Cancel invite** beside pending seat invitations; the existing recipient listener closes the invitation popup. This host control requires an app update. The other payload additions match the already implemented app contracts.

## Verification and rollout

Focused isolated PostgreSQL tests cover historical credit backfill, configured host/user amounts, duplicate credit sources, rollback, reversals, deletion, large integer winnings, participant isolation, blocks, reaction uniqueness, personalized fanout and invitation races. Production build and Android compile/unit tests are run separately. No production data is used by these tests.

Apply all three additive migrations before starting the new server. The Diamond backfill has a five-second lock acquisition timeout and a fifteen-second statement timeout so a busy or oversized migration fails and rolls back rather than waiting indefinitely. Rehearse the backfill against a recent isolated restore and review missing-credit exceptions before production rollout. The game history index is built concurrently, outside a transaction.

Do not use `db push` on production. Keep the previous release available. These changes do not modify gift payouts, announcement thresholds, wallet balances, room coin totals or game settlement logic.

## Results from this implementation

- Portal production build: passed (existing Turbopack tracing warnings remain).
- Focused backend regression run: 111 checks passed, with subsequent delivery/history-guard checks also passing.
- Full portal run: 2,262 passed, 14 skipped, 10 failures plus one incompatible test-suite file. The eight deterministic failures and suite incompatibility reproduce on untouched 8189427; the two timeout failures pass independently. These unrelated fixtures were not changed.
- Android compilation and 939 unit tests: passed; pending invitation cancellation is included in Kotlin_RN.
- Production database/server and remote Git branches have not been changed as part of this implementation.
