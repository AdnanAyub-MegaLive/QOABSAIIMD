// Tailwind utility classes. Keep every candidate literal so the compiler can discover it.
export const rouletteWheelUtilities = [
  // base · & .roulette-wheel-wheel
  "[&_.roulette-wheel-wheel]:[aspect-ratio:1] [&_.roulette-wheel-wheel]:[filter:drop-shadow(0_10px_16px_#0008)] [&_.roulette-wheel-wheel]:[flex-shrink:0] [&_.roulette-wheel-wheel]:[width:min(100cqw,100cqh,340px)] [&_.roulette-wheel-wheel]:[margin:auto] [&_.roulette-wheel-wheel]:relative",
  // base · & .roulette-wheel-rotor
  "[&_.roulette-wheel-rotor]:[will-change:transform] [&_.roulette-wheel-rotor]:w-full [&_.roulette-wheel-rotor]:h-full",
  // base · & .roulette-wheel-rotor svg
  "[&_.roulette-wheel-rotor_svg]:w-full [&_.roulette-wheel-rotor_svg]:h-full [&_.roulette-wheel-rotor_svg]:block",
  // base · & .roulette-wheel-pointer
  "[&_.roulette-wheel-pointer]:[filter:drop-shadow(0_2px_2px_#3e250d)] [&_.roulette-wheel-pointer]:[z-index:2] [&_.roulette-wheel-pointer]:[border-top:26px_solid_#ffe19a] [&_.roulette-wheel-pointer]:[border-left:10px_solid_#0000] [&_.roulette-wheel-pointer]:[border-right:10px_solid_#0000] [&_.roulette-wheel-pointer]:[width:0] [&_.roulette-wheel-pointer]:[height:0] [&_.roulette-wheel-pointer]:absolute [&_.roulette-wheel-pointer]:[top:-2px] [&_.roulette-wheel-pointer]:[left:50%] [&_.roulette-wheel-pointer]:[transform:translate(-50%)]",
  // base · & .roulette-wheel-hub
  "[&_.roulette-wheel-hub]:[color:#ffe9ab] [&_.roulette-wheel-hub]:pointer-events-none [&_.roulette-wheel-hub]:[font-variant-numeric:tabular-nums] [&_.roulette-wheel-hub]:[place-items:center] [&_.roulette-wheel-hub]:[font-size:clamp(20px,6vw,34px)] [&_.roulette-wheel-hub]:[font-weight:800] [&_.roulette-wheel-hub]:grid [&_.roulette-wheel-hub]:absolute [&_.roulette-wheel-hub]:[inset:0]",
  // base · & .roulette-wheel-hub[data-landed=true]
  "[&_.roulette-wheel-hub[data-landed=true]]:[color:#fff]",
  // base · & .roulette-wheel-spotlight
  "[&_.roulette-wheel-spotlight]:[color:#fff2ca] [&_.roulette-wheel-spotlight]:box-border [&_.roulette-wheel-spotlight]:[background:radial-gradient(#0c4c3deb,#052a24f5)] [&_.roulette-wheel-spotlight]:[border:1px_solid_#dcb86b80] [&_.roulette-wheel-spotlight]:[border-radius:28px] [&_.roulette-wheel-spotlight]:[width:min(96vw,510px)] [&_.roulette-wheel-spotlight]:[max-width:96vw] [&_.roulette-wheel-spotlight]:[height:fit-content] [&_.roulette-wheel-spotlight]:[max-height:94dvh] [&_.roulette-wheel-spotlight]:[margin:auto] [&_.roulette-wheel-spotlight]:[padding:18px_8px_14px] [&_.roulette-wheel-spotlight]:[font-family:Arial,sans-serif] [&_.roulette-wheel-spotlight]:fixed [&_.roulette-wheel-spotlight]:[inset:0] [&_.roulette-wheel-spotlight]:overflow-auto [&_.roulette-wheel-spotlight]:[box-shadow:0_22px_80px_#000b]",
  // base · & .roulette-wheel-spotlight::backdrop
  "[&_.roulette-wheel-spotlight::backdrop]:[backdrop-filter:blur(9px)] [&_.roulette-wheel-spotlight::backdrop]:[background:#00120bd9]",
  // base · & .roulette-wheel-spotlight .roulette-wheel-wheel
  "[&_.roulette-wheel-spotlight_.roulette-wheel-wheel]:[width:min(86vw,65dvh,440px)] [&_.roulette-wheel-spotlight_.roulette-wheel-wheel]:[max-width:100%]",
  // base · & .roulette-wheel-spotlight .roulette-wheel-title
  "[&_.roulette-wheel-spotlight_.roulette-wheel-title]:text-center [&_.roulette-wheel-spotlight_.roulette-wheel-title]:[color:#ffe9ab] [&_.roulette-wheel-spotlight_.roulette-wheel-title]:font-bold [&_.roulette-wheel-spotlight_.roulette-wheel-title]:[line-height:1.2] [&_.roulette-wheel-spotlight_.roulette-wheel-title]:[margin:0_0_18px]! [&_.roulette-wheel-spotlight_.roulette-wheel-title]:[font-size:22px]!",
  // base · & .roulette-wheel-spotlight .roulette-wheel-caption
  "[&_.roulette-wheel-spotlight_.roulette-wheel-caption]:text-center [&_.roulette-wheel-spotlight_.roulette-wheel-caption]:[color:#fff6db] [&_.roulette-wheel-spotlight_.roulette-wheel-caption]:font-bold [&_.roulette-wheel-spotlight_.roulette-wheel-caption]:[line-height:1.3] [&_.roulette-wheel-spotlight_.roulette-wheel-caption]:[margin:14px_0_0]! [&_.roulette-wheel-spotlight_.roulette-wheel-caption]:[font-size:19px]!",
  // base · & .roulette-wheel-spotlight .roulette-wheel-dismiss
  "[&_.roulette-wheel-spotlight_.roulette-wheel-dismiss]:[z-index:4] [&_.roulette-wheel-spotlight_.roulette-wheel-dismiss]:[color:#fff2c5] [&_.roulette-wheel-spotlight_.roulette-wheel-dismiss]:cursor-pointer [&_.roulette-wheel-spotlight_.roulette-wheel-dismiss]:[background:#082c24] [&_.roulette-wheel-spotlight_.roulette-wheel-dismiss]:[border:1px_solid_#fff4] [&_.roulette-wheel-spotlight_.roulette-wheel-dismiss]:rounded-full [&_.roulette-wheel-spotlight_.roulette-wheel-dismiss]:[width:34px] [&_.roulette-wheel-spotlight_.roulette-wheel-dismiss]:[height:34px] [&_.roulette-wheel-spotlight_.roulette-wheel-dismiss]:[min-height:34px] [&_.roulette-wheel-spotlight_.roulette-wheel-dismiss]:[font-size:23px] [&_.roulette-wheel-spotlight_.roulette-wheel-dismiss]:absolute [&_.roulette-wheel-spotlight_.roulette-wheel-dismiss]:[top:8px] [&_.roulette-wheel-spotlight_.roulette-wheel-dismiss]:[right:10px]",
  // (prefers-reduced-motion:reduce) · & .roulette-wheel-rotor
  "[@media_(prefers-reduced-motion:reduce)]:[&_.roulette-wheel-rotor]:[will-change:auto]",
].join(" ");

export default {
  "wheel": "roulette-wheel-wheel",
  "rotor": "roulette-wheel-rotor",
  "pointer": "roulette-wheel-pointer",
  "hub": "roulette-wheel-hub",
  "spotlight": "roulette-wheel-spotlight",
  "title": "roulette-wheel-title",
  "caption": "roulette-wheel-caption",
  "dismiss": "roulette-wheel-dismiss"
};
