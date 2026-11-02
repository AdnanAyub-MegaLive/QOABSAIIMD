// Tailwind utility classes. Keep every candidate literal so the compiler can discover it.
export const rouletteDesignUtilities = [
  // base · & .roulette-design
  "[&_.roulette-design]:[align-content:start] [&_.roulette-design]:[height:auto] [&_.roulette-design]:[min-height:100dvh] [&_.roulette-design]:relative [&_.roulette-design]:[color:#fff4cf]! [&_.roulette-design]:[background:radial-gradient(at_50%_28%,#007c5b_0,#00453d_36%,#001b21_70%,#001015_100%)]! [&_.roulette-design]:[grid-template-rows:auto_auto_auto_auto]! [&_.roulette-design]:[gap:8px]! [&_.roulette-design]:[padding:10px_10px_70px]! [&_.roulette-design]:[overflow-y:auto]!",
  // base · & .roulette-design header:first-child
  "[&_.roulette-design_header:first-child]:items-center [&_.roulette-design_header:first-child]:[padding:0_4px] [&_.roulette-design_header:first-child]:relative",
  // base · & .roulette-design header:first-child h1
  "[&_.roulette-design_header:first-child_h1]:[text-shadow:0_2px_1px_#806221] [&_.roulette-design_header:first-child_h1]:[letter-spacing:-.6px] [&_.roulette-design_header:first-child_h1]:[font-weight:850] [&_.roulette-design_header:first-child_h1]:m-0! [&_.roulette-design_header:first-child_h1]:[font-size:26px]!",
  // base · & .roulette-design header:first-child small:first-child
  "[&_.roulette-design_header:first-child_small:first-child]:hidden",
  // base · & .roulette-design header:first-child small
  "[&_.roulette-design_header:first-child_small]:[letter-spacing:0] [&_.roulette-design_header:first-child_small]:[font-size:12px] [&_.roulette-design_header:first-child_small]:font-bold",
  // base · & .roulette-design .roulette-close
  "[&_.roulette-design_.roulette-close]:[height:34px] [&_.roulette-design_.roulette-close]:absolute [&_.roulette-design_.roulette-close]:[top:0] [&_.roulette-design_.roulette-close]:[right:2px] [&_.roulette-design_.roulette-close]:[background:url(/games/roulette/design/pill.png)_50%/125%_170%_no-repeat]! [&_.roulette-design_.roulette-close]:[border:0]! [&_.roulette-design_.roulette-close]:[border-radius:0]! [&_.roulette-design_.roulette-close]:[width:88px]! [&_.roulette-design_.roulette-close]:[font-size:15px]!",
  // base · & .roulette-design header:first-child>button:last-child
  "[&_.roulette-design_header:first-child>button:last-child]:[width:36px] [&_.roulette-design_header:first-child>button:last-child]:[height:36px] [&_.roulette-design_header:first-child>button:last-child]:[min-height:25px] [&_.roulette-design_header:first-child>button:last-child]:[margin-top:0] [&_.roulette-design_header:first-child>button:last-child]:[font-size:18px]",
  // base · & .roulette-design .shared-game-visuals
  "[&_.roulette-design_.shared-game-visuals]:[place-items:end_center] [&_.roulette-design_.shared-game-visuals]:w-full [&_.roulette-design_.shared-game-visuals]:h-full [&_.roulette-design_.shared-game-visuals]:grid",
  // base · & .roulette-design .roulette-wheel-frame
  "[&_.roulette-design_.roulette-wheel-frame]:[aspect-ratio:1] [&_.roulette-design_.roulette-wheel-frame]:[filter:drop-shadow(0_6px_12px_#0008)] [&_.roulette-design_.roulette-wheel-frame]:[width:min(90cqw,95cqh,330px)] [&_.roulette-design_.roulette-wheel-frame]:[max-width:90%] [&_.roulette-design_.roulette-wheel-frame]:[height:auto] [&_.roulette-design_.roulette-wheel-frame]:[max-height:95cqh] [&_.roulette-design_.roulette-wheel-frame]:[margin:0_auto] [&_.roulette-design_.roulette-wheel-frame]:relative",
  // base · & .roulette-design .roulette-wheel-frame>img
  "[&_.roulette-design_.roulette-wheel-frame>img]:object-contain [&_.roulette-design_.roulette-wheel-frame>img]:w-full [&_.roulette-design_.roulette-wheel-frame>img]:h-full",
  // base · & .roulette-design .roulette-gold-pointer
  "[&_.roulette-design_.roulette-gold-pointer]:[z-index:3] [&_.roulette-design_.roulette-gold-pointer]:pointer-events-none [&_.roulette-design_.roulette-gold-pointer]:[background:url(/games/roulette/design/pointer.png)_50%/270%_170%_no-repeat] [&_.roulette-design_.roulette-gold-pointer]:[width:14%] [&_.roulette-design_.roulette-gold-pointer]:[height:21%] [&_.roulette-design_.roulette-gold-pointer]:absolute [&_.roulette-design_.roulette-gold-pointer]:[top:-7%] [&_.roulette-design_.roulette-gold-pointer]:[left:43%]",
  // base · & .roulette-design [role=status]
  "[&_.roulette-design_[role=status]]:[background:#011c1d] [&_.roulette-design_[role=status]]:[border:2px_solid_#44f6f5] [&_.roulette-design_[role=status]]:[border-radius:100px] [&_.roulette-design_[role=status]]:[flex-wrap:wrap] [&_.roulette-design_[role=status]]:justify-center [&_.roulette-design_[role=status]]:[justify-self:center] [&_.roulette-design_[role=status]]:items-center [&_.roulette-design_[role=status]]:[width:95%] [&_.roulette-design_[role=status]]:[min-height:30px] [&_.roulette-design_[role=status]]:[padding:4px_12px] [&_.roulette-design_[role=status]]:[font-size:12px] [&_.roulette-design_[role=status]]:font-bold [&_.roulette-design_[role=status]]:flex",
  // base · & .roulette-timer-icon
  "[&_.roulette-timer-icon]:[background:url(/games/roulette/design/timer.png)_50%/145%_125%_no-repeat] [&_.roulette-timer-icon]:[width:20px] [&_.roulette-timer-icon]:[height:20px] [&_.roulette-timer-icon]:[margin-right:5px]",
  // base · & .roulette-design [role=status]>div
  "[&_.roulette-design_[role=status]>div]:w-full",
  // base · & .shared-betting-contents
  "[&_.shared-betting-contents]:[display:contents]",
  // base · & .roulette-betting-panel
  "[&_.roulette-betting-panel]:[background:url(/games/roulette/design/betting-panel-v2.png)_50%/100%_100%_no-repeat] [&_.roulette-betting-panel]:[gap:8px] [&_.roulette-betting-panel]:[min-width:0] [&_.roulette-betting-panel]:[padding:12px_5px_8px] [&_.roulette-betting-panel]:grid",
  // base · & .roulette-design div[class*="_table"]
  "[&_.roulette-design_div[class*=\"\\_table\"]]:[box-shadow:none]! [&_.roulette-design_div[class*=\"\\_table\"]]:[background:0_0]! [&_.roulette-design_div[class*=\"\\_table\"]]:[border:0]! [&_.roulette-design_div[class*=\"\\_table\"]]:[border-radius:22px]! [&_.roulette-design_div[class*=\"\\_table\"]]:[padding:8px]!",
  // base · & .roulette-design div[class*="_markets"]
  "[&_.roulette-design_div[class*=\"\\_markets\"]]:[gap:7px]!",
  // base · & .roulette-design div[class*="_markets"]>button
  "[&_.roulette-design_div[class*=\"\\_markets\"]>button]:[background:url(/games/roulette/design/market.png)_50%/138%_126%_no-repeat]! [&_.roulette-design_div[class*=\"\\_markets\"]>button]:[border:0]! [&_.roulette-design_div[class*=\"\\_markets\"]>button]:[border-radius:10px]! [&_.roulette-design_div[class*=\"\\_markets\"]>button]:[gap:0]! [&_.roulette-design_div[class*=\"\\_markets\"]>button]:[min-height:54px]! [&_.roulette-design_div[class*=\"\\_markets\"]>button]:[padding:7px_0]!",
  // base · & .roulette-design div[class*="_markets"]>button b
  "[&_.roulette-design_div[class*=\"\\_markets\"]>button_b]:[font-size:20px] [&_.roulette-design_div[class*=\"\\_markets\"]>button_b]:[font-weight:850] [&_.roulette-design_div[class*=\"\\_markets\"]>button_b]:[line-height:1.1]",
  // base · & .roulette-design div[class*="_markets"]>button small
  "[&_.roulette-design_div[class*=\"\\_markets\"]>button_small]:[color:#ffe272] [&_.roulette-design_div[class*=\"\\_markets\"]>button_small]:[font-size:13px] [&_.roulette-design_div[class*=\"\\_markets\"]>button_small]:[font-weight:800] [&_.roulette-design_div[class*=\"\\_markets\"]>button_small]:[line-height:1.1]",
  // base · & .roulette-design div[class*="_markets"]>button span
  "[&_.roulette-design_div[class*=\"\\_markets\"]>button_span]:[color:#c5dfca] [&_.roulette-design_div[class*=\"\\_markets\"]>button_span]:[font-variant-numeric:tabular-nums] [&_.roulette-design_div[class*=\"\\_markets\"]>button_span]:[overflow-wrap:anywhere] [&_.roulette-design_div[class*=\"\\_markets\"]>button_span]:[max-width:100%] [&_.roulette-design_div[class*=\"\\_markets\"]>button_span]:[font-size:10px]",
  // base · & .roulette-design div[class*="_markets"]>button:disabled
  "[&_.roulette-design_div[class*=\"\\_markets\"]>button:disabled]:[opacity:.85]!",
  // base · & .roulette-design div[class*="_chips"]
  "[&_.roulette-design_div[class*=\"\\_chips\"]]:[flex-wrap:wrap] [&_.roulette-design_div[class*=\"\\_chips\"]]:items-center [&_.roulette-design_div[class*=\"\\_chips\"]]:[gap:7px] [&_.roulette-design_div[class*=\"\\_chips\"]]:[padding:6px_0]",
  // base · & .roulette-design div[class*="_chips"]>button
  "[&_.roulette-design_div[class*=\"\\_chips\"]>button]:[background:#004c3a] [&_.roulette-design_div[class*=\"\\_chips\"]>button]:[border:1px_solid_#8eecc5] [&_.roulette-design_div[class*=\"\\_chips\"]>button]:[border-radius:20px] [&_.roulette-design_div[class*=\"\\_chips\"]>button]:[width:auto] [&_.roulette-design_div[class*=\"\\_chips\"]>button]:[min-width:42px] [&_.roulette-design_div[class*=\"\\_chips\"]>button]:[height:auto] [&_.roulette-design_div[class*=\"\\_chips\"]>button]:[min-height:38px] [&_.roulette-design_div[class*=\"\\_chips\"]>button]:[padding:6px_9px] [&_.roulette-design_div[class*=\"\\_chips\"]>button]:[font-size:12px]",
  // base · & .roulette-design button[class*="_play"]
  "[&_.roulette-design_button[class*=\"\\_play\"]]:[color:#fff6d6] [&_.roulette-design_button[class*=\"\\_play\"]]:[padding:10px_19px] [&_.roulette-design_button[class*=\"\\_play\"]]:[font-weight:800] [&_.roulette-design_button[class*=\"\\_play\"]]:[background:url(/games/roulette/design/action.png)_50%/114%_150%_no-repeat]! [&_.roulette-design_button[class*=\"\\_play\"]]:[border:0]!",
  // base · & .roulette-design footer
  "[&_.roulette-design_footer]:box-border [&_.roulette-design_footer]:[width:min(100%,560px)] [&_.roulette-design_footer]:[padding:6px_12px_max(6px,env(safe-area-inset-bottom))] [&_.roulette-design_footer]:[z-index:8] [&_.roulette-design_footer]:[background:#00251ff5] [&_.roulette-design_footer]:[border-top:1px_solid_#d2af5c70] [&_.roulette-design_footer]:[flex-wrap:wrap] [&_.roulette-design_footer]:[gap:5px] [&_.roulette-design_footer]:fixed [&_.roulette-design_footer]:[bottom:0] [&_.roulette-design_footer]:[left:50%] [&_.roulette-design_footer]:[transform:translate(-50%)] [&_.roulette-design_footer]:[box-shadow:0_-6px_20px_#001c1980]",
  // base · & .roulette-design footer>span
  "[&_.roulette-design_footer>span]:[overflow-wrap:anywhere] [&_.roulette-design_footer>span]:[background:url(/games/roulette/design/pill.png)_50%/120%_170%_no-repeat] [&_.roulette-design_footer>span]:[max-width:72%] [&_.roulette-design_footer>span]:[padding:10px_15px_10px_42px] [&_.roulette-design_footer>span]:[font-size:12px] [&_.roulette-design_footer>span]:relative",
  // base · & .roulette-design footer>span:before
  "[&_.roulette-design_footer>span:before]:[content:\"\"] [&_.roulette-design_footer>span:before]:[background:url(/games/roulette/design/coins.png)_50%/135%_135%_no-repeat] [&_.roulette-design_footer>span:before]:[width:30px] [&_.roulette-design_footer>span:before]:[height:28px] [&_.roulette-design_footer>span:before]:absolute [&_.roulette-design_footer>span:before]:[top:7px] [&_.roulette-design_footer>span:before]:[left:8px]",
  // base · & .roulette-design footer>span b
  "[&_.roulette-design_footer>span_b]:[font-size:16px]",
  // base · & .roulette-design footer>button
  "[&_.roulette-design_footer>button]:[min-height:38px] [&_.roulette-design_footer>button]:[padding:3px_8px] [&_.roulette-design_footer>button]:[font-size:12px]",
  // base · & .roulette-design footer>small
  "[&_.roulette-design_footer>small]:text-center [&_.roulette-design_footer>small]:w-full [&_.roulette-design_footer>small]:[font-size:8px]",
  // (max-height:650px) · & .roulette-design
  "[@media_(max-height:650px)]:[&_.roulette-design]:[padding:5px_8px]!",
  // (max-height:650px) · & .roulette-design header:first-child
  "[@media_(max-height:650px)]:[&_.roulette-design_header:first-child]:[padding-top:0]",
  // (max-height:650px) · & .roulette-design header:first-child h1
  "[@media_(max-height:650px)]:[&_.roulette-design_header:first-child_h1]:[font-size:27px]!",
  // (max-height:650px) · & .roulette-design div[class*="_markets"]>button
  "[@media_(max-height:650px)]:[&_.roulette-design_div[class*=\"\\_markets\"]>button]:[min-height:49px]!",
  // (max-height:650px) · & .roulette-design div[class*="_markets"]>button b
  "[@media_(max-height:650px)]:[&_.roulette-design_div[class*=\"\\_markets\"]>button_b]:[font-size:17px]",
  // (max-height:650px) · & .roulette-design div[class*="_markets"]>button small
  "[@media_(max-height:650px)]:[&_.roulette-design_div[class*=\"\\_markets\"]>button_small]:[font-size:14px]",
  // (max-height:650px) · & .roulette-design div[class*="_table"]
  "[@media_(max-height:650px)]:[&_.roulette-design_div[class*=\"\\_table\"]]:[padding:12px_10px]!",
  // (max-height:650px) · & .roulette-design footer>span
  "[@media_(max-height:650px)]:[&_.roulette-design_footer>span]:[padding-top:5px] [@media_(max-height:650px)]:[&_.roulette-design_footer>span]:[padding-bottom:5px]",
  // (max-height:650px) · & .roulette-design header:first-child>button:last-child
  "[@media_(max-height:650px)]:[&_.roulette-design_header:first-child>button:last-child]:[margin-top:32px]",
  // base · & .roulette-design div[class*="_chips"]>button.roulette-image-chip
  "[&_.roulette-design_div[class*=\"\\_chips\"]>button.roulette-image-chip]:[width:54px] [&_.roulette-design_div[class*=\"\\_chips\"]>button.roulette-image-chip]:[min-width:0] [&_.roulette-design_div[class*=\"\\_chips\"]>button.roulette-image-chip]:[height:54px] [&_.roulette-design_div[class*=\"\\_chips\"]>button.roulette-image-chip]:[min-height:0] [&_.roulette-design_div[class*=\"\\_chips\"]>button.roulette-image-chip]:[box-shadow:none] [&_.roulette-design_div[class*=\"\\_chips\"]>button.roulette-image-chip]:[background-color:#0000] [&_.roulette-design_div[class*=\"\\_chips\"]>button.roulette-image-chip]:[background-position:50%] [&_.roulette-design_div[class*=\"\\_chips\"]>button.roulette-image-chip]:[background-repeat:no-repeat] [&_.roulette-design_div[class*=\"\\_chips\"]>button.roulette-image-chip]:[background-size:contain] [&_.roulette-design_div[class*=\"\\_chips\"]>button.roulette-image-chip]:[border:0] [&_.roulette-design_div[class*=\"\\_chips\"]>button.roulette-image-chip]:p-0 [&_.roulette-design_div[class*=\"\\_chips\"]>button.roulette-image-chip]:[transition:transform_.15s,filter_.15s]",
  // base · & .roulette-image-chip>span
  "[&_.roulette-image-chip>span]:[clip-path:inset(50%)] [&_.roulette-image-chip>span]:[width:1px] [&_.roulette-image-chip>span]:[height:1px] [&_.roulette-image-chip>span]:absolute [&_.roulette-image-chip>span]:overflow-hidden",
  // base · & .roulette-design div[class*="_chips"]>button.roulette-image-chip[aria-pressed=true]
  "[&_.roulette-design_div[class*=\"\\_chips\"]>button.roulette-image-chip[aria-pressed=true]]:[filter:drop-shadow(0_0_5px_#ffdf76)] [&_.roulette-design_div[class*=\"\\_chips\"]>button.roulette-image-chip[aria-pressed=true]]:[transform:translateY(-3px)scale(1.08)]",
  // (max-height:650px) · & .roulette-design div[class*="_chips"]>button.roulette-image-chip
  "[@media_(max-height:650px)]:[&_.roulette-design_div[class*=\"\\_chips\"]>button.roulette-image-chip]:[width:40px] [@media_(max-height:650px)]:[&_.roulette-design_div[class*=\"\\_chips\"]>button.roulette-image-chip]:[height:40px]",
  // base · & .roulette-design .shared-game-visuals .roulette-wheel-frame
  "[&_.roulette-design_.shared-game-visuals_.roulette-wheel-frame]:[align-self:center] [&_.roulette-design_.shared-game-visuals_.roulette-wheel-frame]:[width:min(85cqw,80cqh,280px)]! [&_.roulette-design_.shared-game-visuals_.roulette-wheel-frame]:[height:min(85cqw,80cqh,280px)]!",
  // base · & .roulette-design div[class*="_stage"]
  "[&_.roulette-design_div[class*=\"\\_stage\"]]:w-full [&_.roulette-design_div[class*=\"\\_stage\"]]:[height:clamp(210px,35dvh,340px)] [&_.roulette-design_div[class*=\"\\_stage\"]]:[min-height:210px] [&_.roulette-design_div[class*=\"\\_stage\"]]:[container-type:size]",
  // (max-height:600px) · & .roulette-design div[class*="_stage"]
  "[@media_(max-height:600px)]:[&_.roulette-design_div[class*=\"\\_stage\"]]:[height:200px]",
  // (max-height:600px) · & .roulette-design div[class*="_markets"]>button
  "[@media_(max-height:600px)]:[&_.roulette-design_div[class*=\"\\_markets\"]>button]:[min-height:48px]!",
].join(" ");
