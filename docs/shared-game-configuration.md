# Shared game configuration

Open **Games Management → Probability controls**, then configure a game. The same editors are available from the game cards.

## Probability controls

- Rocket: crash-range weights for 0.00–0.99×, 1.00–1.99×, 2.00–2.99×, 3.00–3.99×, 4.00–4.99×, and exactly 5.00× by default; ranges expand with the configured maximum up to 10×. Each 0.01× value within a range has equal probability. There is no automatic payout at the maximum.
- Lucky Flip: Heads probability; Tails receives the remaining probability.
- Roulette: weights for each of the 37 pockets.
- Pizza: weights for each food.
- Dice High / Low: Low and High outcome weights; faces within each group are equally likely.
- Lucky Wheel: weights for 0×, 1×, 2×, 3× and 8× payouts.
- Dragon vs Tiger: Dragon, Tiger and Tie weights; rank pairs within each group are equally likely.
- Mini Slot: no match, pair and triple weights; combinations within each group are equally likely.
- Lucky Dice: weights for each face.
- Rock Paper Scissors: weights for each opponent choice.
- Penalty: weights for each goalkeeper direction.
- Teen Patti: weights for the winning hand position on non-tied deals. The dealt cards and their strengths are preserved; the sole strongest hand is moved to the selected position. Tied deals retain their original positions and settlement rules. Displayed percentages are conditional on a non-tied deal.
- Trivia and Reaction: winning remains based on correct answers and reaction timing, respectively.

For the new controls, probability is weight divided by the sum of weights. For example, High/Low weights 30 and 70 give Low 30% and High 70%. Weights must be whole numbers from 0 to 10,000, with at least one positive value. Zero disables that outcome (for Teen Patti, only on non-tied deals). Reset restores the original probabilities. Existing saved configurations without outcome weights retain their original result generation.

These are shared result probabilities, not a guaranteed win percentage for each player. Opposing bets settle against the same result. A returned stake is distinct from a profitable win. Payout multipliers are unchanged. Player help displays the saved outcome distribution for the active daily schedule.

## Timing and activation

Each game has selection/betting, playing, and results durations, individually configurable from 1 to 3,600 whole seconds. Reaction playing time must allow five seconds for the signal plus the configured reaction target window. Trivia playing time covers all questions in the round.

Saving changes increments the configuration revision. Admin previews use the saved settings immediately. Live shared games retain their UTC daily settings snapshot until the next midnight UTC, so existing bets and results are unchanged. Pausing blocks new bets immediately. Settings are stored in existing JSON configuration fields; no database migration is needed.

## Rocket integration

Rocket is registered as `rocket`, paused by default. Preview at `/games/preview?game=rocket`; the authenticated mobile launch uses `/games/play?game=rocket`. It uses the existing shared daily schedule, application wallet, settings audit, ledger and round history. No schema migration is needed.

One boarding entry per player per flight. `shared-enter` accepts `choice: "board"`; `shared-cashout` accepts the entry `id` and `gameId`. The server ignores client multipliers and payouts. Both cash-out and automatic settlement lock the entry and wallet owner in that order, then write wallet credit, ledger, round receipt, game log and settled status in one transaction. Repeating a successful cash-out returns its original receipt, including after a crash. Cash-out before launch or at/after the crash is rejected. Below 1× returns less than the stake, and payouts round down to whole coins.

Rocket's **playing** duration is the climb from 0× to the configured maximum (default 5×, up to 10×). Crashes are resolved during that window; an early crash stays visible until the original scheduled next round. Thus result display lasts the unused part of the playing window plus the configured result duration. This preserves synchronized empty rounds and the daily clock. The crash point and crash time are never sent ahead of the crash. The UI interpolates an estimated multiplier; the server timestamp at cash-out acceptance determines the receipt. Pausing blocks new boarding while existing flights remain viewable and cashable.

Validation: `npx vitest run src/lib/game-control`; `node scripts/test-rocket-db.mjs` creates and removes its own disposable local PostgreSQL database to verify real transaction locking, rollback, crash boundaries and coin reconciliation. The mobile game panel occupies 70% of the viewport.

### Configurable Rocket maximum

Admins may set the maximum multiplier to a whole number from 1× to 10× (default 5×). Changing it in the editor resets crash weights to equal chances per 0.01× level; edit the new ranges before saving. Flight duration covers the full climb to the selected maximum. Daily snapshots preserve both timing and maximum for existing rounds. Uncashed entries always settle for zero, including crashes at 0× and at the maximum.
