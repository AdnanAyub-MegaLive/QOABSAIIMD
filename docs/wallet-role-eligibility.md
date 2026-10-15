# Wallet role eligibility

Wallet responses, withdrawal quotes, and transaction submission share server-derived eligibility.

| Account | Exchange | Diamond Transfer | USDT withdrawal |
| --- | --- | --- | --- |
| Ordinary (LISTENER/SENDER) | Yes | No | No |
| CS / CS_LEADER, including any combined roles | Yes | No | No |
| HOST, CREATOR, MODERATOR, OFFICIAL, BD, ADMIN, JUNIOR_ADMIN, SENIOR_ADMIN, SUPER_ADMIN, COUNTRY_HEAD, MANAGER | Yes | Yes | Yes |
| Active agency owner | Yes | Yes | Yes |
| RESELLER, including combined non-CS roles | No | Yes | Yes |

CS restrictions take priority, then reseller restrictions. Agency membership or a positive Diamond balance alone does not establish salary eligibility; active agency ownership does. Unknown roles fail closed for cash-out.

All entries remain subject to active/not-deleted account status, session/ban checks, enabled services, complete policy, individual Exchange switch, balance and amount/period limits. Transfer still requires a selected country and an active same-country reseller other than the sender. The existing `hostTransferEnabled` policy switch governs all eligible Diamond senders. Existing agency-linked-host versus ordinary Exchange pricing is unchanged. Reseller Coin top-ups and redemption also respect the CS restriction.

The mobile app should use `diamondExchange.enabled/reason`, `diamondTransfer.enabled/reason`, and `withdrawal.canWithdraw/reason`, not calculate authorization from visible role tags. Roles and agency ownership are reloaded inside the submission transaction. Idempotent replays return existing results without a new debit; ledger and serializable transaction protections are unchanged.

No migration, balance correction, or policy repricing is needed for this change.
