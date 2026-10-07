# Gift XP and account levels

Rules & Profit Split → Account Levels contains editable User and Charm
thresholds and a read-only Sender XP / Receiver XP reference table. Its gift XP
endpoint is GET-only. Level changes still require rules.manage.
Configure gift XP in Uploads → Gifts → Add/Edit (uploads.manage), or in Live
Management's gift form for live gifts (video.manage). Both values are required
by the UI and server: integer 0–1,000,000,000,000. Blank/missing values are rejected;
explicit zero disables that side's XP. Existing assets are not rewritten.

Both tracks start at level 0, with levels 1–10 seeded at cumulative thresholds
900, 1800, 2700, 3600, 4500, 5400, 6300, 7200, 8100 and 9000 XP.
Admins can add further levels and edit thresholds; thresholds must increase.
Publishing a version moves current summaries to the new thresholds without
rewriting XP totals or historical ledger entries. No historical gifts are awarded
again. Reconnect/REST returns the resulting progression.

Every gift has senderXp and receiverXp, initially zero until configured. Award =
configured XP per unit × quantity, independent of gift price, salary or diamonds.
Sender gets USER XP; a linked HOST account receives CHARM XP. Ordinary recipients
do not earn Charm. Talent records without a linked authenticated user are not
guessed/matched by name. Self-gifts do not award XP. Paid, backpack, lucky and
blind-box sends use the sent gift's configured XP, not its payout or prize value.
Live gifts follow the same account levels, superseding the earlier live-commerce
account-progression exclusion; live target coin rewards remain separate.

XP and wallet mutations run in the existing gift transaction. Unique progression
ledger source keys prevent duplicate awards. Amounts remain BigInt internally;
XP changes affect subsequent sends only. Existing /api/me/progression and public
identity contracts remain unchanged. The per-gift XP editor does not change gift
prices or live-only reward rules. Up to 1,000 total configured level rows are
accepted as a bounded configuration size; this is not a fixed 10-level limit.

Verification: `node scripts/test-gift-xp-db.mjs` exercises the XP service against
PostgreSQL using audio and live gift assets, quantity multiplication, duplicate
source protection, ledger writes, progression snapshots and outbox events. Test
fixtures are rolled back. It does not substitute for mobile end-to-end testing.
