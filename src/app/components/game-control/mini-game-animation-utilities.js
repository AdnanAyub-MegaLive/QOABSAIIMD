// Tailwind utility classes. Keep every candidate literal so the compiler can discover it.
export const miniGameAnimationUtilities = [
  // base · & .mini-game-animation-scene
  "[&_.mini-game-animation-scene]:[perspective:800px] [&_.mini-game-animation-scene]:[place-items:center] [&_.mini-game-animation-scene]:w-full [&_.mini-game-animation-scene]:h-full [&_.mini-game-animation-scene]:[min-height:0] [&_.mini-game-animation-scene]:grid [&_.mini-game-animation-scene]:relative [&_.mini-game-animation-scene]:overflow-hidden [&_.mini-game-animation-scene]:[container-type:size]",
  // base · & .mini-game-animation-cardTable
  "[&_.mini-game-animation-cardTable]:text-center [&_.mini-game-animation-cardTable]:[gap:5px] [&_.mini-game-animation-cardTable]:grid",
  // base · & .mini-game-animation-cardTable>div
  "[&_.mini-game-animation-cardTable>div]:justify-center [&_.mini-game-animation-cardTable>div]:[gap:7px] [&_.mini-game-animation-cardTable>div]:flex",
  // base · & .mini-game-animation-cardTable small
  "[&_.mini-game-animation-cardTable_small]:[letter-spacing:2px] [&_.mini-game-animation-cardTable_small]:[font-size:9px]",
  // base · & .mini-game-animation-playingCard
  "[&_.mini-game-animation-playingCard]:[color:#49232e] [&_.mini-game-animation-playingCard]:[background:#fff0ce] [&_.mini-game-animation-playingCard]:[border:2px_solid_#d5b66e] [&_.mini-game-animation-playingCard]:[border-radius:6px] [&_.mini-game-animation-playingCard]:[place-items:center] [&_.mini-game-animation-playingCard]:[width:min(14cqw,22cqh)] [&_.mini-game-animation-playingCard]:[height:min(18cqw,28cqh)] [&_.mini-game-animation-playingCard]:[font-size:min(6cqw,10cqh)] [&_.mini-game-animation-playingCard]:grid [&_.mini-game-animation-playingCard]:[box-shadow:0_3px_7px_#0006]",
  // base · & .mini-game-animation-scene[data-phase=playing] .mini-game-animation-playingCard
  "[&_.mini-game-animation-scene[data-phase=playing]_.mini-game-animation-playingCard]:[animation:.5s_ease-in-out_infinite_mini-game-animation-cardTurn]",
  // base · & .mini-game-animation-scene[data-phase=revealed] .mini-game-animation-playingCard
  "[&_.mini-game-animation-scene[data-phase=revealed]_.mini-game-animation-playingCard]:[animation:.4s_ease-out_mini-game-animation-pop]",
  // base · & .mini-game-animation-hands
  "[&_.mini-game-animation-hands]:justify-center [&_.mini-game-animation-hands]:items-center [&_.mini-game-animation-hands]:[gap:24px] [&_.mini-game-animation-hands]:flex",
  // base · & .mini-game-animation-hands>div
  "[&_.mini-game-animation-hands>div]:text-center [&_.mini-game-animation-hands>div]:[gap:8px] [&_.mini-game-animation-hands>div]:grid",
  // base · & .mini-game-animation-hands small
  "[&_.mini-game-animation-hands_small]:[letter-spacing:2px] [&_.mini-game-animation-hands_small]:[color:#e5d49b] [&_.mini-game-animation-hands_small]:[font:10px_Arial]",
  // base · & .mini-game-animation-quiz small
  "[&_.mini-game-animation-quiz_small]:[letter-spacing:2px] [&_.mini-game-animation-quiz_small]:[color:#e5d49b] [&_.mini-game-animation-quiz_small]:[font:10px_Arial]",
  // base · & .mini-game-animation-hand
  "[&_.mini-game-animation-hand]:[transform-origin:bottom] [&_.mini-game-animation-hand]:[font-size:min(20cqw,45cqh)] [&_.mini-game-animation-hand]:block",
  // base · & .mini-game-animation-hands b
  "[&_.mini-game-animation-hands_b]:[color:#d4b263] [&_.mini-game-animation-hands_b]:[font-size:16px]",
  // base · & .mini-game-animation-scene[data-phase=playing] .mini-game-animation-hand
  "[&_.mini-game-animation-scene[data-phase=playing]_.mini-game-animation-hand]:[animation:.45s_ease-in-out_infinite_mini-game-animation-shake]",
  // base · & .mini-game-animation-scene[data-phase=playing] .mini-game-animation-hands>div:last-child .mini-game-animation-hand
  "[&_.mini-game-animation-scene[data-phase=playing]_.mini-game-animation-hands>div:last-child_.mini-game-animation-hand]:[animation-delay:.1s]",
  // base · & .mini-game-animation-scene[data-phase=revealed] .mini-game-animation-hand
  "[&_.mini-game-animation-scene[data-phase=revealed]_.mini-game-animation-hand]:[animation:.35s_ease-out_mini-game-animation-pop]",
  // base · & .mini-game-animation-die
  "[&_.mini-game-animation-die]:text-center [&_.mini-game-animation-die]:[color:#fff4d8] [&_.mini-game-animation-die]:[filter:drop-shadow(0_6px_5px_#0008)] [&_.mini-game-animation-die]:[background:#96662730] [&_.mini-game-animation-die]:[border-radius:15%] [&_.mini-game-animation-die]:[width:1em] [&_.mini-game-animation-die]:[height:1em] [&_.mini-game-animation-die]:[font-size:min(30cqw,65cqh)] [&_.mini-game-animation-die]:[line-height:1] [&_.mini-game-animation-die]:overflow-hidden",
  // base · & .mini-game-animation-dieStrip
  "[&_.mini-game-animation-dieStrip]:flex-col [&_.mini-game-animation-dieStrip]:[animation:.6s_steps(6,end)_infinite_mini-game-animation-faces] [&_.mini-game-animation-dieStrip]:flex",
  // base · & .mini-game-animation-dieStrip>span
  "[&_.mini-game-animation-dieStrip>span]:[flex:none] [&_.mini-game-animation-dieStrip>span]:[height:1em]",
  // base · & .mini-game-animation-scene[data-phase=playing] .mini-game-animation-die
  "[&_.mini-game-animation-scene[data-phase=playing]_.mini-game-animation-die]:[animation:.6s_ease-in-out_infinite_mini-game-animation-tumble]",
  // base · & .mini-game-animation-scene[data-phase=revealed] .mini-game-animation-die
  "[&_.mini-game-animation-scene[data-phase=revealed]_.mini-game-animation-die]:[animation:.4s_ease-out_mini-game-animation-land]",
  // base · & .mini-game-animation-pitch
  "[&_.mini-game-animation-pitch]:[background:linear-gradient(#19684955,#1d854966)] [&_.mini-game-animation-pitch]:[border-bottom:2px_solid_#fff6] [&_.mini-game-animation-pitch]:[border-radius:12px] [&_.mini-game-animation-pitch]:[width:min(92%,320px)] [&_.mini-game-animation-pitch]:[height:85%] [&_.mini-game-animation-pitch]:[max-height:240px] [&_.mini-game-animation-pitch]:relative",
  // base · & .mini-game-animation-goal
  "[&_.mini-game-animation-goal]:[background:repeating-linear-gradient(0deg,#0000_0_12px,#fff3_12px_13px),repeating-linear-gradient(90deg,#0000_0_12px,#fff3_12px_13px)] [&_.mini-game-animation-goal]:[border:4px_solid_#f9eec9] [&_.mini-game-animation-goal]:[border-bottom:1px_solid_#fff9] [&_.mini-game-animation-goal]:[width:70%] [&_.mini-game-animation-goal]:[height:40%] [&_.mini-game-animation-goal]:absolute [&_.mini-game-animation-goal]:[top:7%] [&_.mini-game-animation-goal]:[left:15%]",
  // base · & .mini-game-animation-keeper
  "[&_.mini-game-animation-keeper]:[font-size:32px] [&_.mini-game-animation-keeper]:absolute [&_.mini-game-animation-keeper]:[top:18%] [&_.mini-game-animation-keeper]:[left:calc(50%_-_20px)]",
  // base · & .mini-game-animation-ball
  "[&_.mini-game-animation-ball]:[font-size:38px] [&_.mini-game-animation-ball]:absolute [&_.mini-game-animation-ball]:[bottom:10%] [&_.mini-game-animation-ball]:[left:calc(50%_-_20px)]",
  // base · & .mini-game-animation-scene[data-phase=playing] .mini-game-animation-ball
  "[&_.mini-game-animation-scene[data-phase=playing]_.mini-game-animation-ball]:[animation:.3s_ease-in-out_infinite_mini-game-animation-ballReady]",
  // base · & .mini-game-animation-scene[data-phase=revealed] .mini-game-animation-ball
  "[&_.mini-game-animation-scene[data-phase=revealed]_.mini-game-animation-ball]:[animation:.8s_ease-out_forwards_mini-game-animation-shoot]",
  // base · & .mini-game-animation-scene[data-phase=revealed] .mini-game-animation-keeper
  "[&_.mini-game-animation-scene[data-phase=revealed]_.mini-game-animation-keeper]:[animation:.65s_ease-out_forwards_mini-game-animation-dive]",
  // base · & .mini-game-animation-signal
  "[&_.mini-game-animation-signal]:[place-items:center] [&_.mini-game-animation-signal]:[gap:10px] [&_.mini-game-animation-signal]:grid [&_.mini-game-animation-signal]:relative",
  // base · & .mini-game-animation-lamp
  "[&_.mini-game-animation-lamp]:[aspect-ratio:1] [&_.mini-game-animation-lamp]:[background:#b44732] [&_.mini-game-animation-lamp]:rounded-full [&_.mini-game-animation-lamp]:[width:min(24cqw,45cqh)] [&_.mini-game-animation-lamp]:[box-shadow:inset_0_0_15px_#0008,0_0_25px_#c74a3244]",
  // base · & .mini-game-animation-signal[data-ready=true] .mini-game-animation-lamp
  "[&_.mini-game-animation-signal[data-ready=true]_.mini-game-animation-lamp]:[background:#5ef69a] [&_.mini-game-animation-signal[data-ready=true]_.mini-game-animation-lamp]:[box-shadow:0_0_35px_#40ff8a88]",
  // base · & .mini-game-animation-signal b
  "[&_.mini-game-animation-signal_b]:[letter-spacing:3px] [&_.mini-game-animation-signal_b]:[font:700_18px_Arial]",
  // base · & .mini-game-animation-signal[data-ready=true] .mini-game-animation-ripple
  "[&_.mini-game-animation-signal[data-ready=true]_.mini-game-animation-ripple]:[border:2px_solid_#5ef69a] [&_.mini-game-animation-signal[data-ready=true]_.mini-game-animation-ripple]:rounded-full [&_.mini-game-animation-signal[data-ready=true]_.mini-game-animation-ripple]:[animation:.8s_ease-out_infinite_mini-game-animation-ripple] [&_.mini-game-animation-signal[data-ready=true]_.mini-game-animation-ripple]:absolute [&_.mini-game-animation-signal[data-ready=true]_.mini-game-animation-ripple]:[inset:-8px]",
  // base · & .mini-game-animation-quiz
  "[&_.mini-game-animation-quiz]:[place-items:center] [&_.mini-game-animation-quiz]:[gap:10px] [&_.mini-game-animation-quiz]:[width:70%] [&_.mini-game-animation-quiz]:grid",
  // base · & .mini-game-animation-card
  "[&_.mini-game-animation-card]:[aspect-ratio:.8] [&_.mini-game-animation-card]:[background:linear-gradient(135deg,#8056b5,#30204a)] [&_.mini-game-animation-card]:[border:2px_solid_#e5c480] [&_.mini-game-animation-card]:[border-radius:14px] [&_.mini-game-animation-card]:[place-items:center] [&_.mini-game-animation-card]:[width:min(22cqw,40cqh)] [&_.mini-game-animation-card]:[font:700_min(16cqw,28cqh)_Arial] [&_.mini-game-animation-card]:grid [&_.mini-game-animation-card]:[box-shadow:6px_6px_#b9924933]",
  // base · & .mini-game-animation-scene[data-phase=playing] .mini-game-animation-card
  "[&_.mini-game-animation-scene[data-phase=playing]_.mini-game-animation-card]:[animation:.6s_ease-in-out_infinite_mini-game-animation-cardTurn]",
  // base · & .mini-game-animation-scene[data-phase=revealed] .mini-game-animation-card
  "[&_.mini-game-animation-scene[data-phase=revealed]_.mini-game-animation-card]:[animation:.4s_ease-out_mini-game-animation-pop]",
  // base · & .mini-game-animation-timer
  "[&_.mini-game-animation-timer]:[background:#fff2] [&_.mini-game-animation-timer]:[border-radius:5px] [&_.mini-game-animation-timer]:w-full [&_.mini-game-animation-timer]:[height:5px] [&_.mini-game-animation-timer]:overflow-hidden",
  // base · & .mini-game-animation-timer span
  "[&_.mini-game-animation-timer_span]:[background:#eac97e] [&_.mini-game-animation-timer_span]:h-full [&_.mini-game-animation-timer_span]:[transition:width_50ms_linear] [&_.mini-game-animation-timer_span]:block",
  // base · & .mini-game-animation-result
  "[&_.mini-game-animation-result]:text-center [&_.mini-game-animation-result]:[letter-spacing:2px] [&_.mini-game-animation-result]:[color:#ccbca3] [&_.mini-game-animation-result]:w-full [&_.mini-game-animation-result]:[font:700_11px_Arial] [&_.mini-game-animation-result]:[animation:.4s_ease-out_mini-game-animation-pop] [&_.mini-game-animation-result]:absolute [&_.mini-game-animation-result]:[bottom:2px] [&_.mini-game-animation-result]:[left:0]",
  // base · & .mini-game-animation-result[data-won=true]
  "[&_.mini-game-animation-result[data-won=true]]:[color:#ffe28b]",
  "[@media_(max-height:500px)]:[&_.mini-game-animation-scene[data-phase=revealed]_.mini-game-animation-ball]:[animation-name:mini-game-animation-shoot-compact]",
  // (max-height:500px) · & .mini-game-animation-hands
  "[@media_(max-height:500px)]:[&_.mini-game-animation-hands]:[gap:14px]",
  // (max-height:500px) · & .mini-game-animation-hands small
  "[@media_(max-height:500px)]:[&_.mini-game-animation-hands_small]:[font-size:8px]",
  // (max-height:500px) · & .mini-game-animation-keeper
  "[@media_(max-height:500px)]:[&_.mini-game-animation-keeper]:[font-size:23px]",
  // (max-height:500px) · & .mini-game-animation-ball
  "[@media_(max-height:500px)]:[&_.mini-game-animation-ball]:[font-size:27px]",
  // (max-height:500px) · & .mini-game-animation-result
  "[@media_(max-height:500px)]:[&_.mini-game-animation-result]:[font-size:9px]",
  // (prefers-reduced-motion:reduce) · & .mini-game-animation-scene *
  "[@media_(prefers-reduced-motion:reduce)]:[&_.mini-game-animation-scene_*]:[transition:none]! [@media_(prefers-reduced-motion:reduce)]:[&_.mini-game-animation-scene_*]:[animation:none]!",
  // (prefers-reduced-motion:reduce) · & .mini-game-animation-scene[data-phase] *
  "[@media_(prefers-reduced-motion:reduce)]:[&_.mini-game-animation-scene[data-phase]_*]:[transition:none]! [@media_(prefers-reduced-motion:reduce)]:[&_.mini-game-animation-scene[data-phase]_*]:[animation:none]!",
].join(" ");

export default {
  "scene": "mini-game-animation-scene",
  "cardTable": "mini-game-animation-cardTable",
  "playingCard": "mini-game-animation-playingCard",
  "hands": "mini-game-animation-hands",
  "quiz": "mini-game-animation-quiz",
  "hand": "mini-game-animation-hand",
  "die": "mini-game-animation-die",
  "dieStrip": "mini-game-animation-dieStrip",
  "pitch": "mini-game-animation-pitch",
  "goal": "mini-game-animation-goal",
  "keeper": "mini-game-animation-keeper",
  "ball": "mini-game-animation-ball",
  "signal": "mini-game-animation-signal",
  "lamp": "mini-game-animation-lamp",
  "ripple": "mini-game-animation-ripple",
  "card": "mini-game-animation-card",
  "timer": "mini-game-animation-timer",
  "result": "mini-game-animation-result"
};
