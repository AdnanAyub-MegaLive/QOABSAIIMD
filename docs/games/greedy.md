# Greedy — logic and visual specification

Status: implemented locally with separate Greedy engine, admin editor, artwork and practice preview. Registered paused by default. Not pushed or deployed.
Reference: WhatsApp Video 2026-11-17 at 12.32.02 PM.mp4 (129 seconds).

## Core rules

Reuse Pizza's eight-outcome weighted-selection model under a separate Greedy game
ID and configuration. Do not modify Pizza's food IDs, settings or existing rounds.
One application-wide round/result is shared across all rooms. Server decides the
outcome; animations only reveal that outcome. No client-selected outcomes.

Clockwise from the top, the video shows:

| Food | Initial gross return |
| --- | --- |
| Roast chicken | 45× |
| Octopus | 25× |
| Fish | 15× |
| Meat | 10× |
| Grapes | 5× |
| Lettuce | 5× |
| Corn | 5× |
| Strawberry | 5× |

These are gross payout multipliers, including the stake. A 100-coin winning
strawberry bet pays 500 coins, for 400 profit. Losing bets pay zero. For multiple
accepted bets, sum every entry's stake and payout; show the complete round result.
Use existing integer-safe financial settlement and rounding, never floating-point
wallet balances. Return the existing bet/payout/game/user announcement fields.

## Round lifecycle

1. OPEN: default 20 seconds, configurable. Choose an admin-configured denomination
   or Custom, choose a food, submit using the existing betting flow. Display
   cumulative accepted stake per food and total for the round. Each accepted bet
   has its own animation; retries reuse the same idempotency key.
2. PLAYING: default 10 seconds, configurable. Lock further betting. Animate the
   highlight around the eight food positions, slowing to the server's outcome.
   Keep food labels upright and readable; no payout is calculated in the browser.
3. RESULTS: default 10 seconds, configurable. Highlight winner, settle each entry
   exactly once, refresh wallet and round history. Show the bottom-centered result
   modal with the user's aggregate payout and application-wide winners; dismiss
   using the existing games modal timeout.
4. Advance automatically, even in empty rounds. Reconnect fetches authoritative
   current phase, accepted bets, settled results and remaining time.

## Configuration and platform integration

Follow existing Games Management: enable/pause, selection/playing/result timings,
min/max bet, preset coin buttons and Custom bounds, eight outcome weights, eight
return multipliers, visibility/play level restrictions, preview mode and rules.
Active resellers may preview but not wager. Practice uses practice balances only.
Live mode uses the existing application coin wallet, ledger, settlement, refund,
ranking and announcement flows. Snapshot configuration for active rounds so an
admin edit cannot alter accepted wagers retrospectively.

Probabilities are normalized weights: weight / sum(weights). Zero disables an
outcome; reject all-zero weights. The video reveals returns, NOT probabilities.
Do not invent production odds or activate with equal weights: equal weights with
these returns would imply average gross return 13.75×. Have admin configure odds
and review expected return before enabling. Preview must label any test odds.

## Visual direction and assets

- Cyan sky, gold/brown wooden wheel, eight food kiosks, central chef mascot,
  red/cream lower console, gold selection accents, bright readable text.
- Fit the playable panel into the established mobile game area without scrolling.
  Reduce decorative space first; retain readable controls and touch targets.
- Build food hit areas, counters, multipliers, labels, chip buttons and results as
  live components. Never bake admin-controlled values into artwork.
- Mascot idle bob/blink, chip travel per accepted bet, moving selection highlight,
  winner pulse and coin celebration. Respect reduced-motion settings.
- Initial generated assets: `public/games/greedy/mascot-v1.png` (transparent) and
  `public/games/greedy/board-v1.png` (portrait backdrop concept). The backdrop is a
  first art pass, not final responsive geometry. Food atlas and CSS kiosk layers are implemented.

## Confirmed bonus, Auto Play and activity rules

- Auto Play places the selected denomination on six distinct server-randomized
  foods once per round, in one idempotent atomic debit. It stops on disable,
  hidden/closed game, paused betting, an unconfirmed placement, or insufficient
  funds for all six. No persisted background betting or automatic retry.
- HOT marks the largest application-wide stake on a food in the current round.
  Ties use the first food in wheel order; no HOT when no stakes exist.
- Salad and Pizza are indicators, never betting targets. Salad selects 2–3 of
  strawberry/corn/lettuce/grapes; Pizza selects 2–3 of chicken/octopus/fish/meat.
  Each selected winning food pays its normal gross multiplier. Results show all
  winning food images. Feeding animation precedes the result dialog.
- Admin sets a whole-coin bonus threshold; 0 disables it. Settled coin stakes
  minus payouts build a durable net pool and fresh-progress counter. Both must
  reach the threshold to trigger a bonus on a new round's first accepted bet.
  Trigger resets fresh progress; subsequent settled nets build it again.
  Bonus payouts are never capped: deficits carry forward and delay later bonuses.
- The outcome is persisted before the first accepted bet under the game lock.
  Retries, other rooms, reconnects and process restarts cannot reroll it. Pool
  accounting commits with entry settlement and wallet credit exactly once.
- My History lists the user's Greedy placements for the rolling previous 24 hours,
  paginated 50 at a time. Ranking shows the top 100 gross returns from settled
  coin entries in the previous 24 hours (100k stake + 95k profit = 195k payout).
- Practice remains isolated; its activity and pool use only the bounded in-memory
  preview state and reset with that preview. Live balances are not involved.

## Implementation locations and checks

- `src/lib/game-control`: independent Greedy food definitions/settings, catalog,
  validation, shared result generation, accepted choices and settlement mapping.
- `src/app/components/game-control`: Greedy wheel, admin editor and player view.
- `public/games/greedy`: generated art; catalog icon and version manifest later.
- Test all eight outcomes, normalized/zero weights, payout precision, repeated
  bets/idempotency, cross-room consistency, late bets, reconnect, refunds, role
  restrictions, preview isolation, config snapshots and complete-round results.
- Preview locally before publication. No production configuration or balances
  changed by this design/asset stage.

## Local verification

Preview: http://localhost:3000/games/preview?game=greedy
Admin configuration: Games Management → Greedy → Configure probabilities.
The preview uses the existing isolated practice wallet; no live wallet writes.
Build passed; game suite covers eight food returns, repeated bet deduplication,
shared cross-room outcome, clock transitions, configuration validation and icons.
The first generated food atlas is served as optimized WebP with CSS sprite cells.
Controls, kiosk frames, chips, history and text are code-rendered for responsiveness.
