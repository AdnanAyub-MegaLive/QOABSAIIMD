# Rocket — interactive design prototype

The integrated implementation now lives in the portal at `/games/preview?game=rocket`. See `../shared-game-configuration.md` for its server, wallet and configuration behavior. This HTML file remains the original standalone design reference.

Open `rocket.html` through a local static server. This is a standalone visual prototype, not a registered production game. It makes no network requests, wallet changes or database writes. Room members and flight history are illustrative.

## Confirmed behavior

- Board with application coins during the selection window.
- The payout multiplier starts at **0×** and climbs gradually toward a maximum of **5×**.
- A player may cash out during flight at stake × the current multiplier, rounded down to whole coins.
- The rocket crashes automatically at a random level anywhere from 0× through 5×, inclusive. A 0× crash is immediate at launch. Players still aboard lose their stake; earlier cash-outs remain safe.
- Timing, bet limits and probabilities belong in the existing admin game configuration.

## Design choices

- Full game panel fits the lower **70%** of the mobile viewport; live room context remains above it. No scrolling inside the game.
- Mint flight path and payout button, navy background, warm rocket exhaust; a coral crash state stays distinct from a safe exit.
- Cash-out button shows the current coin return; the summary tile switches from wallet to live cash-out value, then locked payout.
- A persistent note explains that cashing out below 1× returns less than the stake.
- There is no guaranteed safe endpoint or automatic cash-out at 5×. Players must cash out before the sampled crash point; at the crash boundary, the crash takes precedence.
- Defaults: 20 seconds boarding, 10 seconds to climb from 0× to 5×, 10 seconds showing results. In this prototype, a crash ends the flight early and starts the result window immediately. Live scheduling must explicitly account for early flight endings.
- The state selector previews boarding, active flight, safe cash-out and crash. Gear opens editable practice timing, coin limits and illustrative crash outcomes. No production probabilities are represented by those scenario choices.

## Implementation notes from the design phase (superseded by integration)

Register Rocket in the catalog and shared engine, add crash-range weights and calculated probabilities to its admin editor, and persist timing and odds in the shared schedule snapshot. Resolve a deterministic crash point for the entire room without revealing it before the crash. Decide fixed-duration versus early-ending shared rounds before adapting the clock.

Cash-outs must be authoritative on the server: use the server receipt time and round state, atomically claim each pending entry once, credit the real coin wallet with a ledger entry, and handle retries idempotently. Never trust the client’s displayed multiplier or payout. A cash-out received at or after the crash must be rejected; both 0× and 5× crash boundaries need explicit coverage. The present shared engine settles at reveal and will need an explicit in-flight cash-out path.

Acceptance checks: boarding closes at launch; 0× payouts and below-1× returns; cash-out before/at/after a crash; duplicate and concurrent requests; disconnect/reconnect; no early crash disclosure; maximum 5× payout; room consistency; wallet ledger reconciliation; next-day configuration rollover; all phases within 70% on small screens.

Random prototype mode samples uniformly from 0.00× to 5.00× in 0.01× steps, once per round. The distribution is illustrative; production probabilities still need admin-configured crash-range weights. Fixed crash scenarios are also available for previewing boundary cases.
