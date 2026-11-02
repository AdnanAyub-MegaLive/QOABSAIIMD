# Tailwind styling

All portal administration screens, embedded game players, and the five ranking/event templates use Tailwind. The migration changes presentation, not game settlement, rewards or permissions.

## Portal and games

`src/app/globals.css` loads Tailwind and scans `src/`. Game utility modules contain literal Tailwind classes, including scoped arbitrary variants for existing game markup. Keep class names literal so the compiler can discover them. Do not restore CSS modules or inline presentation styles.

`src/app/game-motion.css` registers the existing animation keyframes inside Tailwind's theme. These preserve dice, roulette, coin and other game motion. Numeric SVG geometry and the roulette Web Animations timeline remain runtime rendering data; they do not determine results.

## Event templates

Each event folder owns its HTML, JavaScript, assets, Tailwind input and compiled stylesheet. `utilities.txt` supplies decoded utility candidates because HTML attributes encode special characters. When changing the root utility classes in HTML, update this candidate list too.

Run `npm run build:events` to compile all event styles. Both `npm run dev` and `npm run build` run this automatically. Commit the generated `style.css` files: published bundles require no Tailwind runtime or external CSS service.

After deploying, regenerate and publish a new version of each affected event through the existing event publishing workflow. Previously published immutable versions are not modified by rebuilding the portal. Never overwrite files under an existing version URL.

## Merge preservation

The stash based on `430e83b` was applied to `1a421ff` and retained as a backup. The seat-lock merge keeps owner-seat repair and the grouped room-card activity helper. Duplicate room-card aggregate calls introduced by combining both versions were removed. No database migration, balance adjustment or reward replay is required for this styling change.
