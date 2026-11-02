// Tailwind utility classes. Keep every candidate literal so the compiler can discover it.
export const teenPattiTableUtilities = [
  // base · & .teen-patti-table-table
  "[&_.teen-patti-table-table]:[color:#def9ff] [&_.teen-patti-table-table]:flex-col [&_.teen-patti-table-table]:[gap:8px] [&_.teen-patti-table-table]:w-full [&_.teen-patti-table-table]:h-full [&_.teen-patti-table-table]:[min-height:0] [&_.teen-patti-table-table]:flex",
  // base · & .teen-patti-table-clock
  "[&_.teen-patti-table-clock]:justify-between [&_.teen-patti-table-clock]:items-center [&_.teen-patti-table-clock]:[gap:5px] [&_.teen-patti-table-clock]:[font-size:11px] [&_.teen-patti-table-clock]:flex",
  // base · & .teen-patti-table-clock strong
  "[&_.teen-patti-table-clock_strong]:[background:#082c46] [&_.teen-patti-table-clock_strong]:[border:1px_solid_#a5ecf7] [&_.teen-patti-table-clock_strong]:rounded-full [&_.teen-patti-table-clock_strong]:[padding:8px] [&_.teen-patti-table-clock_strong]:[font-size:18px]",
  // base · & .teen-patti-table-hands
  "[&_.teen-patti-table-hands]:[flex:1] [&_.teen-patti-table-hands]:[grid-template-columns:repeat(3,minmax(0,1fr))] [&_.teen-patti-table-hands]:[gap:8px] [&_.teen-patti-table-hands]:[min-height:0] [&_.teen-patti-table-hands]:grid",
  // base · & .teen-patti-table-hands .teen-patti-table-hand
  "[&_.teen-patti-table-hands_.teen-patti-table-hand]:[opacity:1] [&_.teen-patti-table-hands_.teen-patti-table-hand]:[color:#e5f7fd] [&_.teen-patti-table-hands_.teen-patti-table-hand]:[background:linear-gradient(#366b80,#11354c)] [&_.teen-patti-table-hands_.teen-patti-table-hand]:[border:1px_solid_#91d6e9] [&_.teen-patti-table-hands_.teen-patti-table-hand]:[border-radius:32px_32px_8px_8px] [&_.teen-patti-table-hands_.teen-patti-table-hand]:flex-col [&_.teen-patti-table-hands_.teen-patti-table-hand]:[justify-content:space-evenly] [&_.teen-patti-table-hands_.teen-patti-table-hand]:items-center [&_.teen-patti-table-hands_.teen-patti-table-hand]:[gap:4px] [&_.teen-patti-table-hands_.teen-patti-table-hand]:[min-width:0] [&_.teen-patti-table-hands_.teen-patti-table-hand]:[min-height:0] [&_.teen-patti-table-hands_.teen-patti-table-hand]:[padding:5px] [&_.teen-patti-table-hands_.teen-patti-table-hand]:flex",
  // base · & .teen-patti-table-hand b
  "[&_.teen-patti-table-hand_b]:[font-size:11px]",
  // base · & .teen-patti-table-crest
  "[&_.teen-patti-table-crest]:[font-size:24px]",
  // base · & .teen-patti-table-cards
  "[&_.teen-patti-table-cards]:[perspective:600px] [&_.teen-patti-table-cards]:[gap:2px] [&_.teen-patti-table-cards]:[width:95%] [&_.teen-patti-table-cards]:[height:32%] [&_.teen-patti-table-cards]:[min-height:30px] [&_.teen-patti-table-cards]:[max-height:90px] [&_.teen-patti-table-cards]:flex",
  // base · & .teen-patti-table-cards span
  "[&_.teen-patti-table-cards_span]:[color:#192438] [&_.teen-patti-table-cards_span]:[background:#fff5e9] [&_.teen-patti-table-cards_span]:[border:1px_solid_#fff] [&_.teen-patti-table-cards_span]:[border-radius:3px] [&_.teen-patti-table-cards_span]:[flex:1] [&_.teen-patti-table-cards_span]:[place-items:center] [&_.teen-patti-table-cards_span]:[min-width:0] [&_.teen-patti-table-cards_span]:[font-size:clamp(11px,3vw,19px)] [&_.teen-patti-table-cards_span]:font-bold [&_.teen-patti-table-cards_span]:[animation:.55s_both_teen-patti-table-reveal] [&_.teen-patti-table-cards_span]:grid",
  // base · & .teen-patti-table-cards span[data-red=true]
  "[&_.teen-patti-table-cards_span[data-red=true]]:[color:#ce2945]",
  // base · & .teen-patti-table-cards span[data-back=true]
  "[&_.teen-patti-table-cards_span[data-back=true]]:[color:#dcf5ff] [&_.teen-patti-table-cards_span[data-back=true]]:[background:repeating-linear-gradient(45deg,#3488a5_0_3px,#17516f_3px_6px)] [&_.teen-patti-table-cards_span[data-back=true]]:[font-size:18px] [&_.teen-patti-table-cards_span[data-back=true]]:[animation:.45s_both_teen-patti-table-deal]",
  // base · & .teen-patti-table-ribbon
  "[&_.teen-patti-table-ribbon]:[color:#523715] [&_.teen-patti-table-ribbon]:[background:linear-gradient(#ffe39c,#bf922e)] [&_.teen-patti-table-ribbon]:[border-radius:3px] [&_.teen-patti-table-ribbon]:[width:105%] [&_.teen-patti-table-ribbon]:[padding:4px_1px] [&_.teen-patti-table-ribbon]:[font-size:10px] [&_.teen-patti-table-ribbon]:font-bold",
  // base · & .teen-patti-table-hand small
  "[&_.teen-patti-table-hand_small]:[font-size:10px]",
  // base · & .teen-patti-table-chips
  "[&_.teen-patti-table-chips]:[color:#ff90cf] [&_.teen-patti-table-chips]:justify-center [&_.teen-patti-table-chips]:[height:15px] [&_.teen-patti-table-chips]:[min-height:10px] [&_.teen-patti-table-chips]:flex",
  // base · & .teen-patti-table-chips i
  "[&_.teen-patti-table-chips_i]:[border:1px_dashed_#fff] [&_.teen-patti-table-chips_i]:rounded-full [&_.teen-patti-table-chips_i]:[margin-left:-3px] [&_.teen-patti-table-chips_i]:[font-size:14px] [&_.teen-patti-table-chips_i]:[font-style:normal] [&_.teen-patti-table-chips_i]:[line-height:14px] [&_.teen-patti-table-chips_i]:[animation:.6s_both_teen-patti-table-chip]",
  // base · & .teen-patti-table-hands .teen-patti-table-hand[data-won=true]
  "[&_.teen-patti-table-hands_.teen-patti-table-hand[data-won=true]]:[border:2px_solid_#ffe77c] [&_.teen-patti-table-hands_.teen-patti-table-hand[data-won=true]]:[box-shadow:0_0_15px_#ffe77c99]",
  // base · & .teen-patti-table-hand[data-won=true] .teen-patti-table-ribbon
  "[&_.teen-patti-table-hand[data-won=true]_.teen-patti-table-ribbon]:[animation:.8s_infinite_alternate_teen-patti-table-glow]",
  // (max-height:550px) · & .teen-patti-table-crest
  "[@media_(max-height:550px)]:[&_.teen-patti-table-crest]:[font-size:18px]",
  // (max-height:550px) · & .teen-patti-table-clock strong
  "[@media_(max-height:550px)]:[&_.teen-patti-table-clock_strong]:[padding:5px] [@media_(max-height:550px)]:[&_.teen-patti-table-clock_strong]:[font-size:14px]",
  // (max-height:550px) · & .teen-patti-table-table
  "[@media_(max-height:550px)]:[&_.teen-patti-table-table]:[gap:4px]",
  // (max-height:550px) · & .teen-patti-table-hands
  "[@media_(max-height:550px)]:[&_.teen-patti-table-hands]:[gap:5px]",
  // (max-height:550px) · & .teen-patti-table-ribbon
  "[@media_(max-height:550px)]:[&_.teen-patti-table-ribbon]:[padding:2px] [@media_(max-height:550px)]:[&_.teen-patti-table-ribbon]:[font-size:9px]",
  // (max-height:550px) · & .teen-patti-table-hand small
  "[@media_(max-height:550px)]:[&_.teen-patti-table-hand_small]:[font-size:9px]",
  // (prefers-reduced-motion:reduce) · & .teen-patti-table-cards span
  "[@media_(prefers-reduced-motion:reduce)]:[&_.teen-patti-table-cards_span]:[animation:none]",
  // (prefers-reduced-motion:reduce) · & .teen-patti-table-cards span[data-back=true]
  "[@media_(prefers-reduced-motion:reduce)]:[&_.teen-patti-table-cards_span[data-back=true]]:[animation:none]",
  // (prefers-reduced-motion:reduce) · & .teen-patti-table-chips i
  "[@media_(prefers-reduced-motion:reduce)]:[&_.teen-patti-table-chips_i]:[animation:none]",
  // (prefers-reduced-motion:reduce) · & .teen-patti-table-hand[data-won=true] .teen-patti-table-ribbon
  "[@media_(prefers-reduced-motion:reduce)]:[&_.teen-patti-table-hand[data-won=true]_.teen-patti-table-ribbon]:[animation:none]",
  // (max-height:560px) · & .teen-patti-table-table .teen-patti-table-hands .teen-patti-table-hand
  "[@media_(max-height:560px)]:[&_.teen-patti-table-table_.teen-patti-table-hands_.teen-patti-table-hand]:[border-radius:18px_18px_6px_6px] [@media_(max-height:560px)]:[&_.teen-patti-table-table_.teen-patti-table-hands_.teen-patti-table-hand]:[gap:1px] [@media_(max-height:560px)]:[&_.teen-patti-table-table_.teen-patti-table-hands_.teen-patti-table-hand]:[padding:3px] [@media_(max-height:560px)]:[&_.teen-patti-table-table_.teen-patti-table-hands_.teen-patti-table-hand]:[line-height:1.1]",
  // (max-height:560px) · & .teen-patti-table-hand .teen-patti-table-crest
  "[@media_(max-height:560px)]:[&_.teen-patti-table-hand_.teen-patti-table-crest]:hidden",
  // (max-height:560px) · & .teen-patti-table-hand .teen-patti-table-cards
  "[@media_(max-height:560px)]:[&_.teen-patti-table-hand_.teen-patti-table-cards]:[height:30%] [@media_(max-height:560px)]:[&_.teen-patti-table-hand_.teen-patti-table-cards]:[min-height:26px]",
  // (max-height:560px) · & .teen-patti-table-hand .teen-patti-table-ribbon
  "[@media_(max-height:560px)]:[&_.teen-patti-table-hand_.teen-patti-table-ribbon]:[padding:1px] [@media_(max-height:560px)]:[&_.teen-patti-table-hand_.teen-patti-table-ribbon]:[line-height:11px]",
  // (max-height:560px) · & .teen-patti-table-hand .teen-patti-table-chips
  "[@media_(max-height:560px)]:[&_.teen-patti-table-hand_.teen-patti-table-chips]:[height:10px] [@media_(max-height:560px)]:[&_.teen-patti-table-hand_.teen-patti-table-chips]:[min-height:10px]",
  // (max-height:560px) · & .teen-patti-table-hand .teen-patti-table-chips i
  "[@media_(max-height:560px)]:[&_.teen-patti-table-hand_.teen-patti-table-chips_i]:[font-size:10px] [@media_(max-height:560px)]:[&_.teen-patti-table-hand_.teen-patti-table-chips_i]:[line-height:10px]",
  // (max-height:560px) · & .teen-patti-table-hand small
  "[@media_(max-height:560px)]:[&_.teen-patti-table-hand_small]:[line-height:10px]",
  // (max-height:560px) · & .teen-patti-table-hand b
  "[@media_(max-height:560px)]:[&_.teen-patti-table-hand_b]:[line-height:12px]",
  // base · & .teen-patti-table-table .teen-patti-table-hands .teen-patti-table-hand:disabled
  "[&_.teen-patti-table-table_.teen-patti-table-hands_.teen-patti-table-hand:disabled]:[opacity:1]",
].join(" ");

export default {
  "table": "teen-patti-table-table",
  "clock": "teen-patti-table-clock",
  "hands": "teen-patti-table-hands",
  "hand": "teen-patti-table-hand",
  "crest": "teen-patti-table-crest",
  "cards": "teen-patti-table-cards",
  "ribbon": "teen-patti-table-ribbon",
  "chips": "teen-patti-table-chips"
};
