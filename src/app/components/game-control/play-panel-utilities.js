// Tailwind utility classes. Keep every candidate literal so the compiler can discover it.
export const playPanelUtilities = [
  // base · & .play-panel-panel
  "[&_.play-panel-panel]:box-border [&_.play-panel-panel]:w-full [&_.play-panel-panel]:[max-width:560px] [&_.play-panel-panel]:[padding:10px_12px_max(8px,env(safe-area-inset-bottom))] [&_.play-panel-panel]:[color:#fff5cf] [&_.play-panel-panel]:[background:radial-gradient(at_50%_5%,#534123,#0000_65%),linear-gradient(#111925,#092f26)] [&_.play-panel-panel]:[grid-template-rows:auto_minmax(160px,1fr)_auto_auto_auto] [&_.play-panel-panel]:[gap:6px] [&_.play-panel-panel]:[height:100dvh] [&_.play-panel-panel]:[min-height:620px] [&_.play-panel-panel]:[max-height:none] [&_.play-panel-panel]:[margin:auto] [&_.play-panel-panel]:[font-family:Arial,sans-serif] [&_.play-panel-panel]:grid [&_.play-panel-panel]:[overflow:hidden_auto]",
  // base · & .play-panel-panel .play-panel-stage
  "[&_.play-panel-panel_.play-panel-stage]:[perspective:900px] [&_.play-panel-panel_.play-panel-stage]:[height:auto] [&_.play-panel-panel_.play-panel-stage]:[min-height:220px] [&_.play-panel-panel_.play-panel-stage]:[container-type:size]",
  // base · & .play-panel-panel .play-panel-header
  "[&_.play-panel-panel_.play-panel-header]:[gap:12px] [&_.play-panel-panel_.play-panel-header]:[line-height:1.2]",
  // base · & .play-panel-panel .play-panel-header p
  "[&_.play-panel-panel_.play-panel-header_p]:[font-size:10px] [&_.play-panel-panel_.play-panel-header_p]:[line-height:14px] [&_.play-panel-panel_.play-panel-header_p]:[margin:3px_0]!",
  // base · & .play-panel-panel .play-panel-customAmount
  "[&_.play-panel-panel_.play-panel-customAmount]:[white-space:normal] [&_.play-panel-panel_.play-panel-customAmount]:[flex-wrap:wrap] [&_.play-panel-panel_.play-panel-customAmount]:[margin:0_0_4px] [&_.play-panel-panel_.play-panel-customAmount]:[line-height:16px]",
  // base · & .play-panel-panel .play-panel-customAmount input
  "[&_.play-panel-panel_.play-panel-customAmount_input]:[flex:1] [&_.play-panel-panel_.play-panel-customAmount_input]:[width:90px] [&_.play-panel-panel_.play-panel-customAmount_input]:[min-width:110px] [&_.play-panel-panel_.play-panel-customAmount_input]:[height:30px] [&_.play-panel-panel_.play-panel-customAmount_input]:[padding:3px_6px] [&_.play-panel-panel_.play-panel-customAmount_input]:[font-size:16px] [&_.play-panel-panel_.play-panel-customAmount_input]:[line-height:20px] [&_.play-panel-panel_.play-panel-customAmount_input]:[color:#fff6d9]! [&_.play-panel-panel_.play-panel-customAmount_input]:[box-shadow:none]! [&_.play-panel-panel_.play-panel-customAmount_input]:[background:#082c24]! [&_.play-panel-panel_.play-panel-customAmount_input]:[border:1px_solid_#d8c387]!",
  // base · & .play-panel-panel .play-panel-customAmount small
  "[&_.play-panel-panel_.play-panel-customAmount_small]:[font-size:11px]",
  // base · & .play-panel-panel .play-panel-chips button
  "[&_.play-panel-panel_.play-panel-chips_button]:[border:1px_solid_#e7cd88] [&_.play-panel-panel_.play-panel-chips_button]:[border-radius:20px] [&_.play-panel-panel_.play-panel-chips_button]:[flex-shrink:0] [&_.play-panel-panel_.play-panel-chips_button]:[width:auto] [&_.play-panel-panel_.play-panel-chips_button]:[min-width:42px] [&_.play-panel-panel_.play-panel-chips_button]:[height:auto] [&_.play-panel-panel_.play-panel-chips_button]:[min-height:38px] [&_.play-panel-panel_.play-panel-chips_button]:[padding:7px_10px] [&_.play-panel-panel_.play-panel-chips_button]:[font-size:12px] [&_.play-panel-panel_.play-panel-chips_button]:[line-height:1.2]",
  // (max-height:560px) · & .play-panel-panel .play-panel-header small
  "[@media_(max-height:560px)]:[&_.play-panel-panel_.play-panel-header_small]:[letter-spacing:.5px] [@media_(max-height:560px)]:[&_.play-panel-panel_.play-panel-header_small]:[font-size:9px]",
  // (max-height:560px) · & .play-panel-panel .play-panel-table
  "[@media_(max-height:560px)]:[&_.play-panel-panel_.play-panel-table]:[padding:4px_6px]",
  // (max-height:560px) · & .play-panel-panel .play-panel-actions
  "[@media_(max-height:560px)]:[&_.play-panel-panel_.play-panel-actions]:[font-size:10px] [@media_(max-height:560px)]:[&_.play-panel-panel_.play-panel-actions]:[line-height:13px]",
  // (max-height:560px) · & .play-panel-panel .play-panel-chips
  "[@media_(max-height:560px)]:[&_.play-panel-panel_.play-panel-chips]:[padding:3px_0]",
  // (max-height:560px) · & .play-panel-panel .play-panel-footer
  "[@media_(max-height:560px)]:[&_.play-panel-panel_.play-panel-footer]:[line-height:14px]",
  // (max-height:560px) · & .play-panel-panel .play-panel-footer small
  "[@media_(max-height:560px)]:[&_.play-panel-panel_.play-panel-footer_small]:[font-size:9px] [@media_(max-height:560px)]:[&_.play-panel-panel_.play-panel-footer_small]:[line-height:12px]",
  // base · & .play-panel-teenPanel
  "[&_.play-panel-teenPanel]:[background:radial-gradient(at_top,#538e9f,#163f5a_65%,#071b33)] [&_.play-panel-teenPanel]:[grid-template-rows:auto_minmax(150px,1fr)_auto_auto_auto]",
  // base · & .play-panel-teenPanel .play-panel-table
  "[&_.play-panel-teenPanel_.play-panel-table]:[background:linear-gradient(#254b63,#122c45)] [&_.play-panel-teenPanel_.play-panel-table]:[border-color:#71b7cc]",
  // base · & .play-panel-teenPanel .play-panel-stage
  "[&_.play-panel-teenPanel_.play-panel-stage]:[min-height:270px] [&_.play-panel-teenPanel_.play-panel-stage]:[padding-top:4px]",
  // base · & .play-panel-teenPanel .play-panel-header small
  "[&_.play-panel-teenPanel_.play-panel-header_small]:[letter-spacing:1px] [&_.play-panel-teenPanel_.play-panel-header_small]:[color:#c4f2ff]",
  // base · & .play-panel-panel .play-panel-table
  "[&_.play-panel-panel_.play-panel-table]:relative",
  // base · & .play-panel-sharedEntryChip
  "[&_.play-panel-sharedEntryChip]:pointer-events-none [&_.play-panel-sharedEntryChip]:[z-index:2] [&_.play-panel-sharedEntryChip]:[background:#7554b3] [&_.play-panel-sharedEntryChip]:[border:2px_dashed_#ffe1a2] [&_.play-panel-sharedEntryChip]:rounded-full [&_.play-panel-sharedEntryChip]:[padding:8px] [&_.play-panel-sharedEntryChip]:[font-size:10px] [&_.play-panel-sharedEntryChip]:[animation:.65s_ease-out_both_play-panel-sharedChip] [&_.play-panel-sharedEntryChip]:absolute [&_.play-panel-sharedEntryChip]:[top:-20px] [&_.play-panel-sharedEntryChip]:[right:12px]",
  // (prefers-reduced-motion:reduce) · & .play-panel-sharedEntryChip
  "[@media_(prefers-reduced-motion:reduce)]:[&_.play-panel-sharedEntryChip]:[animation:none]",
  // base · & .play-panel-sharedTitle
  "[&_.play-panel-sharedTitle]:text-center [&_.play-panel-sharedTitle]:[gap:12px] [&_.play-panel-sharedTitle]:grid",
  // base · & .play-panel-sharedTitle span
  "[&_.play-panel-sharedTitle_span]:[color:#eacc85] [&_.play-panel-sharedTitle_span]:[font-size:min(20cqw,45cqh)]",
  // base · & .play-panel-sharedTitle strong
  "[&_.play-panel-sharedTitle_strong]:[letter-spacing:2px] [&_.play-panel-sharedTitle_strong]:[font-size:14px]",
  // base · & .play-panel-sharedHands
  "[&_.play-panel-sharedHands]:[grid-template-columns:repeat(3,minmax(0,1fr))] [&_.play-panel-sharedHands]:[gap:5px] [&_.play-panel-sharedHands]:grid",
  // base · & .play-panel-sharedHands button
  "[&_.play-panel-sharedHands_button]:[gap:6px] [&_.play-panel-sharedHands_button]:[min-width:0] [&_.play-panel-sharedHands_button]:[padding:8px_3px] [&_.play-panel-sharedHands_button]:grid",
  // base · & .play-panel-sharedHands small
  "[&_.play-panel-sharedHands_small]:[font-size:10px]",
  // base · & .play-panel-threeCards
  "[&_.play-panel-threeCards]:justify-center [&_.play-panel-threeCards]:[gap:2px] [&_.play-panel-threeCards]:flex",
  // base · & .play-panel-threeCards i
  "[&_.play-panel-threeCards_i]:[color:#172133] [&_.play-panel-threeCards_i]:[background:linear-gradient(135deg,#cfe6ee,#5d819c)] [&_.play-panel-threeCards_i]:[border:1px_solid_#f6e3a6] [&_.play-panel-threeCards_i]:[border-radius:3px] [&_.play-panel-threeCards_i]:[flex:1] [&_.play-panel-threeCards_i]:[min-width:0] [&_.play-panel-threeCards_i]:[padding:8px_2px] [&_.play-panel-threeCards_i]:[font-size:13px] [&_.play-panel-threeCards_i]:[font-style:normal] [&_.play-panel-threeCards_i]:[transition:transform_.7s]",
  // base · & .play-panel-sharedHands button[data-winner=true]
  "[&_.play-panel-sharedHands_button[data-winner=true]]:[opacity:1] [&_.play-panel-sharedHands_button[data-winner=true]]:[border:2px_solid_#ffe18a] [&_.play-panel-sharedHands_button[data-winner=true]]:[box-shadow:0_0_15px_#f8cf6d88]",
  // base · & .play-panel-sharedHands button[data-winner=true] .play-panel-threeCards
  "[&_.play-panel-sharedHands_button[data-winner=true]_.play-panel-threeCards]:[animation:.7s_ease-out_play-panel-sharedReveal]",
  // (prefers-reduced-motion:reduce) · & .play-panel-sharedHands button[data-winner=true] .play-panel-threeCards
  "[@media_(prefers-reduced-motion:reduce)]:[&_.play-panel-sharedHands_button[data-winner=true]_.play-panel-threeCards]:[animation:none]",
  // base · & .play-panel-amountPicker .play-panel-chips
  "[&_.play-panel-amountPicker_.play-panel-chips]:[gap:6px]",
  // base · & .play-panel-amountPicker .play-panel-chips button:last-child
  "[&_.play-panel-amountPicker_.play-panel-chips_button:last-child]:[font-size:10px]",
  // base · & .play-panel-customAmount
  "[&_.play-panel-customAmount]:items-center [&_.play-panel-customAmount]:[gap:6px] [&_.play-panel-customAmount]:[margin-bottom:5px] [&_.play-panel-customAmount]:[font-size:11px] [&_.play-panel-customAmount]:flex",
  // base · & .play-panel-customAmount input
  "[&_.play-panel-customAmount_input]:[color:#fff] [&_.play-panel-customAmount_input]:[background:#092d24] [&_.play-panel-customAmount_input]:[border:1px_solid_#d4bc78] [&_.play-panel-customAmount_input]:[border-radius:6px] [&_.play-panel-customAmount_input]:[width:100px] [&_.play-panel-customAmount_input]:[min-width:0] [&_.play-panel-customAmount_input]:[padding:5px]",
  // base · & .play-panel-customAmount small
  "[&_.play-panel-customAmount_small]:[margin-left:auto]",
  // (max-height:560px) · & .play-panel-panel
  "[@media_(max-height:560px)]:[&_.play-panel-panel]:[grid-template-rows:auto_minmax(0,1fr)_auto_auto_auto] [@media_(max-height:560px)]:[&_.play-panel-panel]:[gap:3px] [@media_(max-height:560px)]:[&_.play-panel-panel]:[padding-top:5px]",
  // (max-height:560px) · & .play-panel-panel .play-panel-question
  "[@media_(max-height:560px)]:[&_.play-panel-panel_.play-panel-question]:[font-size:12px] [@media_(max-height:560px)]:[&_.play-panel-panel_.play-panel-question]:[line-height:14px]",
  // (max-height:560px) · & .play-panel-panel .play-panel-miniChoices button
  "[@media_(max-height:560px)]:[&_.play-panel-panel_.play-panel-miniChoices_button]:[min-height:32px] [@media_(max-height:560px)]:[&_.play-panel-panel_.play-panel-miniChoices_button]:[padding:3px] [@media_(max-height:560px)]:[&_.play-panel-panel_.play-panel-miniChoices_button]:[font-size:12px]",
  // (max-height:560px) · & .play-panel-customAmount input
  "[@media_(max-height:560px)]:[&_.play-panel-customAmount_input]:[padding:3px]",
  // base · & .play-panel-miniHero
  "[&_.play-panel-miniHero]:text-center [&_.play-panel-miniHero]:[filter:drop-shadow(0_8px_10px_#0008)] [&_.play-panel-miniHero]:[font-size:min(25cqw,60cqh)]",
  // base · & .play-panel-miniChoices
  "[&_.play-panel-miniChoices]:[grid-template-columns:repeat(2,minmax(0,1fr))] [&_.play-panel-miniChoices]:[gap:6px] [&_.play-panel-miniChoices]:grid",
  // base · & .play-panel-miniChoices button
  "[&_.play-panel-miniChoices_button]:[text-transform:capitalize] [&_.play-panel-miniChoices_button]:[overflow-wrap:anywhere] [&_.play-panel-miniChoices_button]:[min-height:40px] [&_.play-panel-miniChoices_button]:[padding:5px] [&_.play-panel-miniChoices_button]:[font-size:14px]",
  // base · & .play-panel-question
  "[&_.play-panel-question]:[font-size:14px] [&_.play-panel-question]:[line-height:18px] [&_.play-panel-question]:[margin-bottom:8px]!",
  // base · & .play-panel-question small
  "[&_.play-panel-question_small]:[color:#ffe083]",
  // base · & .play-panel-panel .play-panel-reactionPad
  "[&_.play-panel-panel_.play-panel-reactionPad]:[background:#913a30] [&_.play-panel-panel_.play-panel-reactionPad]:w-full [&_.play-panel-panel_.play-panel-reactionPad]:[min-height:70px] [&_.play-panel-panel_.play-panel-reactionPad]:[font-size:24px] [&_.play-panel-panel_.play-panel-reactionPad]:font-bold",
  // base · & .play-panel-panel .play-panel-go
  "[&_.play-panel-panel_.play-panel-go]:[color:#082b18] [&_.play-panel-panel_.play-panel-go]:[background:#39ae63]",
  // base · & .play-panel-panel .play-panel-wheel
  "[&_.play-panel-panel_.play-panel-wheel]:[place-self:center] [&_.play-panel-panel_.play-panel-wheel]:[width:min(60cqw,100cqh)] [&_.play-panel-panel_.play-panel-wheel]:[height:auto]",
  // base · & .play-panel-panel .play-panel-flipping
  "[&_.play-panel-panel_.play-panel-flipping]:[will-change:transform] [&_.play-panel-panel_.play-panel-flipping]:[animation:1.2s_ease-in-out_infinite_play-panel-coinToss]",
  // (prefers-reduced-motion:reduce) · & .play-panel-panel .play-panel-flipping
  "[@media_(prefers-reduced-motion:reduce)]:[&_.play-panel-panel_.play-panel-flipping]:[animation:none]",
  // base · & .play-panel-panel *
  "[&_.play-panel-panel_*]:box-border",
  // base · & .play-panel-panel button
  "[&_.play-panel-panel_button]:cursor-pointer [&_.play-panel-panel_button]:[color:inherit] [&_.play-panel-panel_button]:[font:inherit] [&_.play-panel-panel_button]:[background:#173d32] [&_.play-panel-panel_button]:[border:1px_solid_#d6b76e80] [&_.play-panel-panel_button]:[border-radius:10px] [&_.play-panel-panel_button]:[min-height:34px]",
  // base · & .play-panel-panel button:disabled
  "[&_.play-panel-panel_button:disabled]:[opacity:.45] [&_.play-panel-panel_button:disabled]:cursor-not-allowed",
  // base · & .play-panel-panel button:focus-visible
  "[&_.play-panel-panel_button:focus-visible]:[outline-offset:2px] [&_.play-panel-panel_button:focus-visible]:[outline:3px_solid_#fff]",
  // base · & .play-panel-header
  "[&_.play-panel-header]:justify-between [&_.play-panel-header]:items-center [&_.play-panel-header]:flex",
  // base · & .play-panel-header small
  "[&_.play-panel-header_small]:[letter-spacing:2px] [&_.play-panel-header_small]:[color:#d9c998] [&_.play-panel-header_small]:[font-size:10px]",
  // base · & .play-panel-header h1
  "[&_.play-panel-header_h1]:[margin:2px_0]! [&_.play-panel-header_h1]:[font-size:22px]!",
  // base · & .play-panel-header button
  "[&_.play-panel-header_button]:rounded-full [&_.play-panel-header_button]:[flex-shrink:0] [&_.play-panel-header_button]:[width:36px] [&_.play-panel-header_button]:[font-size:23px] [&_.play-panel-header_button]:font-bold",
  // base · & .play-panel-stage
  "[&_.play-panel-stage]:[place-items:center] [&_.play-panel-stage]:[min-height:0] [&_.play-panel-stage]:grid [&_.play-panel-stage]:relative",
  // base · & .play-panel-wheel
  "[&_.play-panel-wheel]:[aspect-ratio:1] [&_.play-panel-wheel]:[filter:drop-shadow(0_8px_7px_#0009)] [&_.play-panel-wheel]:[max-width:100%] [&_.play-panel-wheel]:h-full [&_.play-panel-wheel]:relative",
  // base · & .play-panel-wheel img
  "[&_.play-panel-wheel_img]:object-contain [&_.play-panel-wheel_img]:w-full [&_.play-panel-wheel_img]:h-full [&_.play-panel-wheel_img]:[transition:transform_1.4s_cubic-bezier(.15,.7,.2,1)]",
  // base · & .play-panel-wheel i
  "[&_.play-panel-wheel_i]:[border-inline:8px_solid_#0000] [&_.play-panel-wheel_i]:[z-index:1] [&_.play-panel-wheel_i]:[border-top:18px_solid_#ffe79e] [&_.play-panel-wheel_i]:absolute [&_.play-panel-wheel_i]:[top:1%] [&_.play-panel-wheel_i]:[left:calc(50%_-_8px)]",
  // base · & .play-panel-coin
  "[&_.play-panel-coin]:[aspect-ratio:1] [&_.play-panel-coin]:[color:#65400c] [&_.play-panel-coin]:[background:radial-gradient(circle_at_32%_25%,#ffeda7,#c38a2b_65%,#704018)] [&_.play-panel-coin]:[border:8px_double_#f4d281] [&_.play-panel-coin]:rounded-full [&_.play-panel-coin]:flex-col [&_.play-panel-coin]:justify-center [&_.play-panel-coin]:items-center [&_.play-panel-coin]:[max-width:100%] [&_.play-panel-coin]:[height:90%] [&_.play-panel-coin]:[max-height:230px] [&_.play-panel-coin]:flex [&_.play-panel-coin]:[box-shadow:inset_0_0_0_5px_#b08236,0_12px_25px_#0006]",
  // base · & .play-panel-coin b
  "[&_.play-panel-coin_b]:[font-size:clamp(24px,6vh,60px)]",
  // base · & .play-panel-coin span
  "[&_.play-panel-coin_span]:[letter-spacing:2px] [&_.play-panel-coin_span]:[font-size:10px]",
  // base · & .play-panel-flipping
  "[&_.play-panel-flipping]:[animation:.6s_linear_infinite_play-panel-flip]",
  // base · & .play-panel-status
  "[&_.play-panel-status]:text-center [&_.play-panel-status]:[overflow-wrap:anywhere] [&_.play-panel-status]:[min-height:32px] [&_.play-panel-status]:[font-size:12px] [&_.play-panel-status]:[line-height:16px]",
  // base · & .play-panel-table
  "[&_.play-panel-table]:[background:radial-gradient(at_top,#15835d,#065136)] [&_.play-panel-table]:[border:2px_solid_#c29e50] [&_.play-panel-table]:[border-radius:22px_22px_12px_12px] [&_.play-panel-table]:[padding:10px] [&_.play-panel-table]:[box-shadow:inset_0_0_20px_#002e22]",
  // base · & .play-panel-markets
  "[&_.play-panel-markets]:[grid-template-columns:repeat(4,minmax(0,1fr))] [&_.play-panel-markets]:[gap:6px] [&_.play-panel-markets]:grid",
  // base · & .play-panel-markets button
  "[&_.play-panel-markets_button]:[background:#16825580] [&_.play-panel-markets_button]:[border:1px_solid_#a4e1bc8c] [&_.play-panel-markets_button]:[border-radius:6px] [&_.play-panel-markets_button]:flex-col [&_.play-panel-markets_button]:justify-center [&_.play-panel-markets_button]:items-center [&_.play-panel-markets_button]:[gap:2px] [&_.play-panel-markets_button]:[min-height:64px] [&_.play-panel-markets_button]:flex",
  // base · & .play-panel-markets strong
  "[&_.play-panel-markets_strong]:[font-size:19px]",
  // base · & .play-panel-markets small
  "[&_.play-panel-markets_small]:[font-size:12px]",
  // base · & .play-panel-markets span
  "[&_.play-panel-markets_span]:[color:#ffdf7a] [&_.play-panel-markets_span]:[font-size:11px]",
  // base · & .play-panel-markets .play-panel-red
  "[&_.play-panel-markets_.play-panel-red]:[background:#a53a3a70]",
  // base · & .play-panel-choices
  "[&_.play-panel-choices]:[grid-template-columns:1fr_1fr] [&_.play-panel-choices]:[gap:12px] [&_.play-panel-choices]:grid",
  // base · & .play-panel-choices button
  "[&_.play-panel-choices_button]:[text-transform:capitalize] [&_.play-panel-choices_button]:justify-center [&_.play-panel-choices_button]:items-center [&_.play-panel-choices_button]:[gap:12px] [&_.play-panel-choices_button]:[min-height:68px] [&_.play-panel-choices_button]:flex",
  // base · & .play-panel-choices b
  "[&_.play-panel-choices_b]:[border:2px_solid_#e0c379] [&_.play-panel-choices_b]:rounded-full [&_.play-panel-choices_b]:[place-items:center] [&_.play-panel-choices_b]:[width:40px] [&_.play-panel-choices_b]:[height:40px] [&_.play-panel-choices_b]:[font-size:24px] [&_.play-panel-choices_b]:grid",
  // base · & .play-panel-panel button[aria-pressed=true]
  "[&_.play-panel-panel_button[aria-pressed=true]]:[background:#6941aa] [&_.play-panel-panel_button[aria-pressed=true]]:[border:2px_solid_#fbe4a2] [&_.play-panel-panel_button[aria-pressed=true]]:[box-shadow:0_0_10px_#e9b84970]",
  // base · & .play-panel-chips
  "[&_.play-panel-chips]:justify-center [&_.play-panel-chips]:[gap:12px] [&_.play-panel-chips]:[padding:10px_0] [&_.play-panel-chips]:flex",
  // base · & .play-panel-chips button
  "[&_.play-panel-chips_button]:[background:linear-gradient(135deg,#a4b7b0,#45655b)] [&_.play-panel-chips_button]:[border:3px_dashed_#e9dfbe] [&_.play-panel-chips_button]:rounded-full [&_.play-panel-chips_button]:[width:48px] [&_.play-panel-chips_button]:[height:48px] [&_.play-panel-chips_button]:[font-size:12px] [&_.play-panel-chips_button]:font-bold",
  // base · & .play-panel-actions
  "[&_.play-panel-actions]:items-center [&_.play-panel-actions]:[gap:8px] [&_.play-panel-actions]:[font-size:12px] [&_.play-panel-actions]:flex",
  // base · & .play-panel-actions span
  "[&_.play-panel-actions_span]:[margin-right:auto]",
  // base · & .play-panel-actions b
  "[&_.play-panel-actions_b]:[color:#ffe282] [&_.play-panel-actions_b]:block",
  // base · & .play-panel-actions button
  "[&_.play-panel-actions_button]:[padding:0_12px]",
  // base · & .play-panel-actions .play-panel-play
  "[&_.play-panel-actions_.play-panel-play]:[color:#312307] [&_.play-panel-actions_.play-panel-play]:[background:linear-gradient(#f8e0a0,#bd8b35)] [&_.play-panel-actions_.play-panel-play]:[min-width:86px] [&_.play-panel-actions_.play-panel-play]:font-bold",
  // base · & .play-panel-panel .play-panel-footer
  "[&_.play-panel-panel_.play-panel-footer]:[letter-spacing:normal] [&_.play-panel-panel_.play-panel-footer]:[color:inherit] [&_.play-panel-panel_.play-panel-footer]:[flex-wrap:wrap] [&_.play-panel-panel_.play-panel-footer]:justify-between [&_.play-panel-panel_.play-panel-footer]:items-center [&_.play-panel-panel_.play-panel-footer]:[gap:4px] [&_.play-panel-panel_.play-panel-footer]:[padding:6px_0] [&_.play-panel-panel_.play-panel-footer]:[font-size:12px] [&_.play-panel-panel_.play-panel-footer]:flex",
  // base · & .play-panel-footer button
  "[&_.play-panel-footer_button]:[padding:0_10px]",
  // base · & .play-panel-footer small
  "[&_.play-panel-footer_small]:text-center [&_.play-panel-footer_small]:[color:#b8c9b9] [&_.play-panel-footer_small]:w-full [&_.play-panel-footer_small]:[font-size:10px]",
  // base · & .play-panel-help
  "[&_.play-panel-help]:[color:#493b23] [&_.play-panel-help]:box-border [&_.play-panel-help]:[overscroll-behavior:contain] [&_.play-panel-help]:[background:#fff6df] [&_.play-panel-help]:[border:2px_solid_#c7a55e] [&_.play-panel-help]:[border-radius:16px] [&_.play-panel-help]:[width:min(92vw,440px)] [&_.play-panel-help]:[max-width:92vw] [&_.play-panel-help]:[height:fit-content] [&_.play-panel-help]:[max-height:85dvh] [&_.play-panel-help]:[margin:auto] [&_.play-panel-help]:[padding:18px] [&_.play-panel-help]:[line-height:1.5] [&_.play-panel-help]:fixed [&_.play-panel-help]:[inset:0] [&_.play-panel-help]:overflow-auto",
  // base · & .play-panel-help::backdrop
  "[&_.play-panel-help::backdrop]:[backdrop-filter:blur(7px)] [&_.play-panel-help::backdrop]:[background:#00140cbb]",
  // base · & .play-panel-help header
  "[&_.play-panel-help_header]:justify-between [&_.play-panel-help_header]:items-center [&_.play-panel-help_header]:[gap:12px] [&_.play-panel-help_header]:flex",
  // base · & .play-panel-help h2
  "[&_.play-panel-help_h2]:[font-size:20px]",
  // base · & .play-panel-help button
  "[&_.play-panel-help_button]:[color:#493b23] [&_.play-panel-help_button]:[background:#ead8ac] [&_.play-panel-help_button]:[min-width:36px]",
  // base · & .play-panel-help p
  "[&_.play-panel-help_p]:[font-size:14px] [&_.play-panel-help_p]:[margin:12px_0]!",
  // (max-height:560px) · & .play-panel-header h1
  "[@media_(max-height:560px)]:[&_.play-panel-header_h1]:[font-size:17px]!",
  // (max-height:560px) · & .play-panel-markets button
  "[@media_(max-height:560px)]:[&_.play-panel-markets_button]:[min-height:48px]",
  // (max-height:560px) · & .play-panel-markets strong
  "[@media_(max-height:560px)]:[&_.play-panel-markets_strong]:[font-size:16px]",
  // (max-height:560px) · & .play-panel-table
  "[@media_(max-height:560px)]:[&_.play-panel-table]:[padding:6px]",
  // (max-height:560px) · & .play-panel-chips
  "[@media_(max-height:560px)]:[&_.play-panel-chips]:[gap:10px] [@media_(max-height:560px)]:[&_.play-panel-chips]:[padding:5px]",
  // (max-height:560px) · & .play-panel-chips button
  "[@media_(max-height:560px)]:[&_.play-panel-chips_button]:[width:38px] [@media_(max-height:560px)]:[&_.play-panel-chips_button]:[height:38px] [@media_(max-height:560px)]:[&_.play-panel-chips_button]:[font-size:10px]",
  // (max-height:560px) · & .play-panel-choices button
  "[@media_(max-height:560px)]:[&_.play-panel-choices_button]:[min-height:50px]",
  // (max-height:560px) · & .play-panel-status
  "[@media_(max-height:560px)]:[&_.play-panel-status]:[min-height:28px] [@media_(max-height:560px)]:[&_.play-panel-status]:[font-size:11px] [@media_(max-height:560px)]:[&_.play-panel-status]:[line-height:14px]",
  // (max-height:560px) · & .play-panel-footer button
  "[@media_(max-height:560px)]:[&_.play-panel-footer_button]:[min-height:28px]",
  // (prefers-reduced-motion:reduce) · & .play-panel-wheel img
  "[@media_(prefers-reduced-motion:reduce)]:[&_.play-panel-wheel_img]:[transition:none]",
  // (prefers-reduced-motion:reduce) · & .play-panel-flipping
  "[@media_(prefers-reduced-motion:reduce)]:[&_.play-panel-flipping]:[animation:none]",
  // base · & .play-panel-rouletteLanding
  "[&_.play-panel-rouletteLanding]:[animation:2.2s_cubic-bezier(.12,.72,.12,1)_both_play-panel-rouletteLanding]",
  // (prefers-reduced-motion:reduce) · & .play-panel-rouletteLanding
  "[@media_(prefers-reduced-motion:reduce)]:[&_.play-panel-rouletteLanding]:[transform:rotate(var(--wheel-landing))] [@media_(prefers-reduced-motion:reduce)]:[&_.play-panel-rouletteLanding]:[animation:none]",
  // base · & .play-panel-roundHistory
  "[&_.play-panel-roundHistory]:[flex-wrap:wrap] [&_.play-panel-roundHistory]:[gap:4px] [&_.play-panel-roundHistory]:[max-width:100%] [&_.play-panel-roundHistory]:[margin:4px_0] [&_.play-panel-roundHistory]:flex",
  // base · & .play-panel-roundHistory span
  "[&_.play-panel-roundHistory_span]:[color:#f9e7ad] [&_.play-panel-roundHistory_span]:[text-overflow:ellipsis] [&_.play-panel-roundHistory_span]:whitespace-nowrap [&_.play-panel-roundHistory_span]:[background:#102d29] [&_.play-panel-roundHistory_span]:[border:1px_solid_#ffffff30] [&_.play-panel-roundHistory_span]:[border-radius:6px] [&_.play-panel-roundHistory_span]:[max-width:100%] [&_.play-panel-roundHistory_span]:[padding:2px_6px] [&_.play-panel-roundHistory_span]:[font-size:10px] [&_.play-panel-roundHistory_span]:[line-height:16px] [&_.play-panel-roundHistory_span]:overflow-hidden",
  // base · & .play-panel-winnerList
  "[&_.play-panel-winnerList]:text-left [&_.play-panel-winnerList]:[max-height:35vh] [&_.play-panel-winnerList]:[margin-top:18px] [&_.play-panel-winnerList]:[font-size:13px] [&_.play-panel-winnerList]:[overflow-y:auto]",
  // base · & .play-panel-help.play-panel-resultSheet
  "[&_.play-panel-help.play-panel-resultSheet]:box-border [&_.play-panel-help.play-panel-resultSheet]:[padding-bottom:calc(20px_+_env(safe-area-inset-bottom))] [&_.play-panel-help.play-panel-resultSheet]:[overscroll-behavior:contain] [&_.play-panel-help.play-panel-resultSheet]:[color:#fff2cf] [&_.play-panel-help.play-panel-resultSheet]:text-center [&_.play-panel-help.play-panel-resultSheet]:[background:linear-gradient(150deg,#153e34,#082b25)] [&_.play-panel-help.play-panel-resultSheet]:[border:1px_solid_#dfc47b] [&_.play-panel-help.play-panel-resultSheet]:[border-radius:24px] [&_.play-panel-help.play-panel-resultSheet]:[width:min(90vw,400px)] [&_.play-panel-help.play-panel-resultSheet]:[max-width:90vw] [&_.play-panel-help.play-panel-resultSheet]:[height:fit-content] [&_.play-panel-help.play-panel-resultSheet]:[max-height:84dvh] [&_.play-panel-help.play-panel-resultSheet]:[margin:auto] [&_.play-panel-help.play-panel-resultSheet]:[padding:20px] [&_.play-panel-help.play-panel-resultSheet]:fixed [&_.play-panel-help.play-panel-resultSheet]:[inset:0] [&_.play-panel-help.play-panel-resultSheet]:[overflow-y:auto] [&_.play-panel-help.play-panel-resultSheet]:[box-shadow:0_24px_90px_#000a]",
  // base · & .play-panel-header>div
  "[&_.play-panel-header>div]:[min-width:0]",
  // base · & .play-panel-panel .play-panel-header h1
  "[&_.play-panel-panel_.play-panel-header_h1]:[font-size:24px]!",
  // base · & .play-panel-panel .play-panel-chips
  "[&_.play-panel-panel_.play-panel-chips]:[flex-wrap:wrap] [&_.play-panel-panel_.play-panel-chips]:[gap:6px]",
  // base · & .play-panel-panel .play-panel-actions
  "[&_.play-panel-panel_.play-panel-actions]:[flex-wrap:wrap]",
  // base · & .play-panel-panel .play-panel-actions button
  "[&_.play-panel-panel_.play-panel-actions_button]:[min-height:40px]",
  // base · & .play-panel-panel .play-panel-miniChoices button
  "[&_.play-panel-panel_.play-panel-miniChoices_button]:[min-height:44px]",
  // base · & .play-panel-panel .play-panel-footer span
  "[&_.play-panel-panel_.play-panel-footer_span]:[overflow-wrap:anywhere]",
  // base · & .play-panel-help header h2
  "[&_.play-panel-help_header_h2]:[color:inherit] [&_.play-panel-help_header_h2]:m-0! [&_.play-panel-help_header_h2]:[font-size:20px]!",
  // base · & .play-panel-help header button
  "[&_.play-panel-help_header_button]:[border:0] [&_.play-panel-help_header_button]:rounded-full [&_.play-panel-help_header_button]:[flex-shrink:0] [&_.play-panel-help_header_button]:[min-height:36px] [&_.play-panel-help_header_button]:[font-size:22px]",
  // base · & .play-panel-help li
  "[&_.play-panel-help_li]:[margin:12px_0] [&_.play-panel-help_li]:[font-size:14px] [&_.play-panel-help_li]:[line-height:1.6]",
  // base · & .play-panel-help ol
  "[&_.play-panel-help_ol]:[padding-left:20px]",
  // base · & .play-panel-help summary
  "[&_.play-panel-help_summary]:cursor-pointer [&_.play-panel-help_summary]:font-bold",
  // base · & .play-panel-resultSheet header
  "[&_.play-panel-resultSheet_header]:text-left",
  // base · & .play-panel-resultSheet header button
  "[&_.play-panel-resultSheet_header_button]:[color:#f7df9d] [&_.play-panel-resultSheet_header_button]:[background:#ffffff12]",
  // base · & .play-panel-resultHero
  "[&_.play-panel-resultHero]:[justify-items:center] [&_.play-panel-resultHero]:[gap:6px] [&_.play-panel-resultHero]:[margin:22px_auto_18px] [&_.play-panel-resultHero]:grid",
  // base · & .play-panel-resultHero strong
  "[&_.play-panel-resultHero_strong]:[overflow-wrap:anywhere] [&_.play-panel-resultHero_strong]:[color:#fff4cc] [&_.play-panel-resultHero_strong]:[max-width:100%] [&_.play-panel-resultHero_strong]:[font-size:clamp(26px,10vw,48px)] [&_.play-panel-resultHero_strong]:[line-height:1.15]",
  // base · & .play-panel-resultHero[data-color] strong
  "[&_.play-panel-resultHero[data-color]_strong]:[background:#112724] [&_.play-panel-resultHero[data-color]_strong]:[border:3px_solid_#e0c277] [&_.play-panel-resultHero[data-color]_strong]:rounded-full [&_.play-panel-resultHero[data-color]_strong]:[place-items:center] [&_.play-panel-resultHero[data-color]_strong]:[width:86px] [&_.play-panel-resultHero[data-color]_strong]:[height:86px] [&_.play-panel-resultHero[data-color]_strong]:grid",
  // base · & .play-panel-resultHero[data-color=Red] strong
  "[&_.play-panel-resultHero[data-color=Red]_strong]:[background:#b72f46]",
  // base · & .play-panel-resultHero[data-color=Green] strong
  "[&_.play-panel-resultHero[data-color=Green]_strong]:[background:#12825a]",
  // base · & .play-panel-resultHero span
  "[&_.play-panel-resultHero_span]:[color:#ddce9a] [&_.play-panel-resultHero_span]:[font-size:13px]",
  // base · & .play-panel-resultTotals
  "[&_.play-panel-resultTotals]:[grid-template-columns:repeat(3,minmax(0,1fr))] [&_.play-panel-resultTotals]:[gap:6px] [&_.play-panel-resultTotals]:grid",
  // base · & .play-panel-resultTotals div
  "[&_.play-panel-resultTotals_div]:[background:#ffffff09] [&_.play-panel-resultTotals_div]:[border-radius:10px] [&_.play-panel-resultTotals_div]:[gap:6px] [&_.play-panel-resultTotals_div]:[min-width:0] [&_.play-panel-resultTotals_div]:[padding:12px_3px] [&_.play-panel-resultTotals_div]:grid",
  // base · & .play-panel-resultTotals small
  "[&_.play-panel-resultTotals_small]:[color:#c2cdbf] [&_.play-panel-resultTotals_small]:[font-size:11px]",
  // base · & .play-panel-resultTotals b
  "[&_.play-panel-resultTotals_b]:[overflow-wrap:anywhere] [&_.play-panel-resultTotals_b]:[font-size:15px]",
  // base · & .play-panel-resultSheet .play-panel-noBet
  "[&_.play-panel-resultSheet_.play-panel-noBet]:[color:#c2d3c5] [&_.play-panel-resultSheet_.play-panel-noBet]:[font-size:13px]!",
  // base · & .play-panel-resultSheet .play-panel-resultDone
  "[&_.play-panel-resultSheet_.play-panel-resultDone]:[color:#153d30] [&_.play-panel-resultSheet_.play-panel-resultDone]:[background:#ead18d] [&_.play-panel-resultSheet_.play-panel-resultDone]:[border:0] [&_.play-panel-resultSheet_.play-panel-resultDone]:[border-radius:12px] [&_.play-panel-resultSheet_.play-panel-resultDone]:w-full [&_.play-panel-resultSheet_.play-panel-resultDone]:[min-height:44px] [&_.play-panel-resultSheet_.play-panel-resultDone]:[margin-top:18px] [&_.play-panel-resultSheet_.play-panel-resultDone]:font-bold",
  // base · & .play-panel-winnerList p
  "[&_.play-panel-winnerList_p]:justify-between [&_.play-panel-winnerList_p]:[gap:10px] [&_.play-panel-winnerList_p]:flex",
  // base · & .play-panel-winnerList span
  "[&_.play-panel-winnerList_span]:[color:#b6edb9]",
  // (max-height:550px) · & .play-panel-panel .play-panel-stage
  "[@media_(max-height:550px)]:[&_.play-panel-panel_.play-panel-stage]:[height:210px] [@media_(max-height:550px)]:[&_.play-panel-panel_.play-panel-stage]:[min-height:210px]",
  // (max-height:550px) · & .play-panel-panel .play-panel-header h1
  "[@media_(max-height:550px)]:[&_.play-panel-panel_.play-panel-header_h1]:[font-size:20px]!",
  // (max-height:550px) · & .play-panel-help.play-panel-resultSheet
  "[@media_(max-height:550px)]:[&_.play-panel-help.play-panel-resultSheet]:[padding:14px]",
  // (max-height:550px) · & .play-panel-resultHero
  "[@media_(max-height:550px)]:[&_.play-panel-resultHero]:[margin:12px_auto]",
  // (max-height:550px) · & .play-panel-resultHero[data-color] strong
  "[@media_(max-height:550px)]:[&_.play-panel-resultHero[data-color]_strong]:[width:64px] [@media_(max-height:550px)]:[&_.play-panel-resultHero[data-color]_strong]:[height:64px] [@media_(max-height:550px)]:[&_.play-panel-resultHero[data-color]_strong]:[font-size:30px]",
  // (max-height:550px) · & .play-panel-panel
  "[@media_(max-height:550px)]:[&_.play-panel-panel]:[height:auto] [@media_(max-height:550px)]:[&_.play-panel-panel]:[min-height:100dvh]",
  // (max-height:550px) · & .play-panel-teenPanel .play-panel-stage
  "[@media_(max-height:550px)]:[&_.play-panel-teenPanel_.play-panel-stage]:[height:270px] [@media_(max-height:550px)]:[&_.play-panel-teenPanel_.play-panel-stage]:[min-height:270px]",
].join(" ");

export default {
  "panel": "play-panel-panel",
  "stage": "play-panel-stage",
  "header": "play-panel-header",
  "customAmount": "play-panel-customAmount",
  "chips": "play-panel-chips",
  "table": "play-panel-table",
  "actions": "play-panel-actions",
  "footer": "play-panel-footer",
  "teenPanel": "play-panel-teenPanel",
  "sharedEntryChip": "play-panel-sharedEntryChip",
  "sharedTitle": "play-panel-sharedTitle",
  "sharedHands": "play-panel-sharedHands",
  "threeCards": "play-panel-threeCards",
  "amountPicker": "play-panel-amountPicker",
  "question": "play-panel-question",
  "miniChoices": "play-panel-miniChoices",
  "miniHero": "play-panel-miniHero",
  "reactionPad": "play-panel-reactionPad",
  "go": "play-panel-go",
  "wheel": "play-panel-wheel",
  "flipping": "play-panel-flipping",
  "coin": "play-panel-coin",
  "status": "play-panel-status",
  "markets": "play-panel-markets",
  "red": "play-panel-red",
  "choices": "play-panel-choices",
  "play": "play-panel-play",
  "help": "play-panel-help",
  "rouletteLanding": "play-panel-rouletteLanding",
  "roundHistory": "play-panel-roundHistory",
  "winnerList": "play-panel-winnerList",
  "resultSheet": "play-panel-resultSheet",
  "resultHero": "play-panel-resultHero",
  "resultTotals": "play-panel-resultTotals",
  "noBet": "play-panel-noBet",
  "resultDone": "play-panel-resultDone"
};
