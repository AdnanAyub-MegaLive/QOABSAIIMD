// Tailwind utility classes. Keep every candidate literal so the compiler can discover it.
export const rocketPlayerUtilities = [
  // base · & .rocket-player-shell
  "[&_.rocket-player-shell]:[color:#edf5fb] [&_.rocket-player-shell]:[background:radial-gradient(at_30%_0,#2c454b,#162334_60%)] [&_.rocket-player-shell]:[max-width:560px] [&_.rocket-player-shell]:[height:auto] [&_.rocket-player-shell]:[min-height:100dvh] [&_.rocket-player-shell]:[margin:auto] [&_.rocket-player-shell]:[font-family:Arial,sans-serif] [&_.rocket-player-shell]:[overflow:hidden_auto]",
  // base · & .rocket-player-shell *
  "[&_.rocket-player-shell_*]:box-border",
  // base · & .rocket-player-shell button
  "[&_.rocket-player-shell_button]:[font:inherit] [&_.rocket-player-shell_button]:cursor-pointer",
  // base · & .rocket-player-shell input
  "[&_.rocket-player-shell_input]:[font:inherit]",
  // base · & .rocket-player-shell button:disabled
  "[&_.rocket-player-shell_button:disabled]:[cursor:default]",
  // base · & .rocket-player-shell button:focus-visible
  "[&_.rocket-player-shell_button:focus-visible]:[outline-offset:2px] [&_.rocket-player-shell_button:focus-visible]:[outline:2px_solid_#86f4d4]",
  // base · & .rocket-player-shell input:focus-visible
  "[&_.rocket-player-shell_input:focus-visible]:[outline-offset:2px] [&_.rocket-player-shell_input:focus-visible]:[outline:2px_solid_#86f4d4]",
  // base · & .rocket-player-context
  "[&_.rocket-player-context]:flex-col [&_.rocket-player-context]:justify-center [&_.rocket-player-context]:[gap:10px] [&_.rocket-player-context]:[height:30%] [&_.rocket-player-context]:[padding:22px_26px] [&_.rocket-player-context]:flex",
  // base · & .rocket-player-context>span
  "[&_.rocket-player-context>span]:[letter-spacing:2px] [&_.rocket-player-context>span]:[color:#87c5b6] [&_.rocket-player-context>span]:[font-size:9px]",
  // base · & .rocket-player-context h2
  "[&_.rocket-player-context_h2]:[letter-spacing:-.8px] [&_.rocket-player-context_h2]:[color:#e4f3f0] [&_.rocket-player-context_h2]:m-0! [&_.rocket-player-context_h2]:[font-size:25px]!",
  // base · & .rocket-player-context p
  "[&_.rocket-player-context_p]:[color:#92aabb] [&_.rocket-player-context_p]:[line-height:1.5] [&_.rocket-player-context_p]:m-0! [&_.rocket-player-context_p]:[font-size:11px]!",
  // base · & .rocket-player-context small
  "[&_.rocket-player-context_small]:[color:#92aabb] [&_.rocket-player-context_small]:[opacity:.65] [&_.rocket-player-context_small]:[line-height:1.5] [&_.rocket-player-context_small]:m-0! [&_.rocket-player-context_small]:[font-size:11px]!",
  // base · & .rocket-player-game
  "[&_.rocket-player-game]:[padding:17px_18px_max(12px,env(safe-area-inset-bottom))] [&_.rocket-player-game]:[background:#0e1726] [&_.rocket-player-game]:[border:1px_solid_#354053] [&_.rocket-player-game]:[border-bottom:0] [&_.rocket-player-game]:[border-radius:0] [&_.rocket-player-game]:[grid-template-rows:auto_auto_minmax(200px,1fr)_auto_auto_auto] [&_.rocket-player-game]:[gap:9px] [&_.rocket-player-game]:[height:100dvh] [&_.rocket-player-game]:[min-height:580px] [&_.rocket-player-game]:grid [&_.rocket-player-game]:relative [&_.rocket-player-game]:overflow-visible",
  // base · & .rocket-player-header
  "[&_.rocket-player-header]:[flex-wrap:wrap] [&_.rocket-player-header]:justify-between [&_.rocket-player-header]:items-center [&_.rocket-player-header]:[gap:8px] [&_.rocket-player-header]:flex",
  // base · & .rocket-player-header>div
  "[&_.rocket-player-header>div]:items-center [&_.rocket-player-header>div]:[gap:9px] [&_.rocket-player-header>div]:flex",
  // base · & .rocket-player-header strong
  "[&_.rocket-player-header_strong]:[letter-spacing:1px] [&_.rocket-player-header_strong]:[font-size:18px] [&_.rocket-player-header_strong]:[font-style:italic]",
  // base · & .rocket-player-header span
  "[&_.rocket-player-header_span]:[color:#78e9c6] [&_.rocket-player-header_span]:[background:#1b302f] [&_.rocket-player-header_span]:[border:1px_solid_#36584f] [&_.rocket-player-header_span]:[border-radius:4px] [&_.rocket-player-header_span]:[padding:4px] [&_.rocket-player-header_span]:[font-size:8px]",
  // base · & .rocket-player-header button
  "[&_.rocket-player-header_button]:[color:#a4b1c4] [&_.rocket-player-header_button]:[background:0_0] [&_.rocket-player-header_button]:[border:1px_solid_#2e3b50] [&_.rocket-player-header_button]:rounded-full [&_.rocket-player-header_button]:[width:29px] [&_.rocket-player-header_button]:[height:29px]",
  // base · & .rocket-player-history
  "[&_.rocket-player-history]:whitespace-nowrap [&_.rocket-player-history]:items-center [&_.rocket-player-history]:[gap:6px] [&_.rocket-player-history]:[min-height:22px] [&_.rocket-player-history]:flex [&_.rocket-player-history]:overflow-hidden",
  // base · & .rocket-player-history span
  "[&_.rocket-player-history_span]:[color:#8fa0ba] [&_.rocket-player-history_span]:[background:#192436] [&_.rocket-player-history_span]:[border:1px_solid_#233147] [&_.rocket-player-history_span]:[border-radius:5px] [&_.rocket-player-history_span]:[padding:4px_7px] [&_.rocket-player-history_span]:[font-size:10px] [&_.rocket-player-history_span]:font-semibold",
  // base · & .rocket-player-history .rocket-player-high
  "[&_.rocket-player-history_.rocket-player-high]:[color:#7be9c6] [&_.rocket-player-history_.rocket-player-high]:[background:#18352f] [&_.rocket-player-history_.rocket-player-high]:[border-color:#294b41]",
  // base · & .rocket-player-history small
  "[&_.rocket-player-history_small]:[color:#687a94] [&_.rocket-player-history_small]:[font-size:8px]",
  // base · & .rocket-player-history small:last-child
  "[&_.rocket-player-history_small:last-child]:[margin-left:auto]",
  // base · & .rocket-player-flight
  "[&_.rocket-player-flight]:[background:radial-gradient(at_68%_65%,#143a3d77,#0000_62%),#101d2e] [&_.rocket-player-flight]:[border:1px_solid_#203148] [&_.rocket-player-flight]:[border-radius:14px] [&_.rocket-player-flight]:[min-height:0] [&_.rocket-player-flight]:relative [&_.rocket-player-flight]:overflow-hidden [&_.rocket-player-flight]:[container-type:size]",
  // base · & .rocket-player-flight:after
  "[&_.rocket-player-flight:after]:[content:\"\"] [&_.rocket-player-flight:after]:[opacity:.35] [&_.rocket-player-flight:after]:pointer-events-none [&_.rocket-player-flight:after]:[background-image:radial-gradient(circle,#869ebaaa_.6px,#0000_1px)] [&_.rocket-player-flight:after]:[background-size:43px_37px] [&_.rocket-player-flight:after]:absolute [&_.rocket-player-flight:after]:[inset:0]",
  // base · & .rocket-player-flightTop
  "[&_.rocket-player-flightTop]:[z-index:2] [&_.rocket-player-flightTop]:[letter-spacing:1px] [&_.rocket-player-flightTop]:[color:#90b6b4] [&_.rocket-player-flightTop]:justify-between [&_.rocket-player-flightTop]:items-center [&_.rocket-player-flightTop]:[font-size:10px] [&_.rocket-player-flightTop]:flex [&_.rocket-player-flightTop]:absolute [&_.rocket-player-flightTop]:[top:12px] [&_.rocket-player-flightTop]:[left:12px] [&_.rocket-player-flightTop]:[right:12px]",
  // base · & .rocket-player-flightTop small
  "[&_.rocket-player-flightTop_small]:[color:#61738c] [&_.rocket-player-flightTop_small]:[font-size:8px]",
  // base · & .rocket-player-multiplier
  "[&_.rocket-player-multiplier]:[z-index:2] [&_.rocket-player-multiplier]:flex-col [&_.rocket-player-multiplier]:[gap:5px] [&_.rocket-player-multiplier]:flex [&_.rocket-player-multiplier]:absolute [&_.rocket-player-multiplier]:[top:23%] [&_.rocket-player-multiplier]:[left:18px]",
  // base · & .rocket-player-multiplier strong
  "[&_.rocket-player-multiplier_strong]:[letter-spacing:-2px] [&_.rocket-player-multiplier_strong]:[font-variant-numeric:tabular-nums] [&_.rocket-player-multiplier_strong]:[font-size:clamp(32px,5vh,49px)] [&_.rocket-player-multiplier_strong]:[font-weight:750] [&_.rocket-player-multiplier_strong]:[line-height:1]",
  // base · & .rocket-player-multiplier strong span
  "[&_.rocket-player-multiplier_strong_span]:[color:#b8c9d7] [&_.rocket-player-multiplier_strong_span]:[font-size:.65em]",
  // base · & .rocket-player-multiplier small
  "[&_.rocket-player-multiplier_small]:[color:#7b92a9] [&_.rocket-player-multiplier_small]:[font-size:9px]",
  // base · & .rocket-player-scene
  "[&_.rocket-player-scene]:w-full [&_.rocket-player-scene]:h-full [&_.rocket-player-scene]:absolute [&_.rocket-player-scene]:[inset:0]",
  // base · & .rocket-player-trail
  "[&_.rocket-player-trail]:[stroke:#65e8bf] [&_.rocket-player-trail]:[stroke-width:2.5px] [&_.rocket-player-trail]:[fill:none] [&_.rocket-player-trail]:[filter:drop-shadow(0_0_6px_#55eac1aa)]",
  // base · & .rocket-player-rocket
  "[&_.rocket-player-rocket]:[z-index:2] [&_.rocket-player-rocket]:[will-change:left,top] [&_.rocket-player-rocket]:[width:min(40px,20cqh)] [&_.rocket-player-rocket]:[height:min(62px,30cqh)] [&_.rocket-player-rocket]:absolute",
  // base · & .rocket-player-rocket svg
  "[&_.rocket-player-rocket_svg]:[filter:drop-shadow(0_0_9px_#73edc355)] [&_.rocket-player-rocket_svg]:w-full [&_.rocket-player-rocket_svg]:h-full",
  // base · & .rocket-player-fire
  "[&_.rocket-player-fire]:[transform-origin:50%_75%] [&_.rocket-player-fire]:[animation:.18s_ease-in-out_infinite_alternate_rocket-player-burn]",
  // base · & .rocket-player-altitude
  "[&_.rocket-player-altitude]:[color:#52647c] [&_.rocket-player-altitude]:flex-col [&_.rocket-player-altitude]:justify-between [&_.rocket-player-altitude]:[font-size:8px] [&_.rocket-player-altitude]:flex [&_.rocket-player-altitude]:absolute [&_.rocket-player-altitude]:[top:30%] [&_.rocket-player-altitude]:[bottom:18%] [&_.rocket-player-altitude]:[right:9px]",
  // base · & .rocket-player-flightStatus
  "[&_.rocket-player-flightStatus]:[z-index:2] [&_.rocket-player-flightStatus]:[color:#a9c4c4] [&_.rocket-player-flightStatus]:justify-between [&_.rocket-player-flightStatus]:items-center [&_.rocket-player-flightStatus]:[gap:5px] [&_.rocket-player-flightStatus]:[font-size:11px] [&_.rocket-player-flightStatus]:flex [&_.rocket-player-flightStatus]:absolute [&_.rocket-player-flightStatus]:[bottom:10px] [&_.rocket-player-flightStatus]:[left:12px] [&_.rocket-player-flightStatus]:[right:12px]",
  // base · & .rocket-player-flightStatus b
  "[&_.rocket-player-flightStatus_b]:[color:#8df2ce] [&_.rocket-player-flightStatus_b]:whitespace-nowrap [&_.rocket-player-flightStatus_b]:[background:#133b31d9] [&_.rocket-player-flightStatus_b]:[border:1px_solid_#2d5550] [&_.rocket-player-flightStatus_b]:[border-radius:4px] [&_.rocket-player-flightStatus_b]:[padding:5px_6px] [&_.rocket-player-flightStatus_b]:[font-size:8px] [&_.rocket-player-flightStatus_b]:font-medium",
  // base · & .rocket-player-crashed
  "[&_.rocket-player-crashed]:[background:radial-gradient(at_75%_40%,#61323855,#0000_70%),#181b2a]",
  // base · & .rocket-player-crashed .rocket-player-multiplier strong
  "[&_.rocket-player-crashed_.rocket-player-multiplier_strong]:[color:#ff9992]",
  // base · & .rocket-player-crashed .rocket-player-trail
  "[&_.rocket-player-crashed_.rocket-player-trail]:[stroke:#f18d88] [&_.rocket-player-crashed_.rocket-player-trail]:[filter:none]",
  // base · & .rocket-player-stats
  "[&_.rocket-player-stats]:[grid-template-columns:1fr_1fr] [&_.rocket-player-stats]:[gap:8px] [&_.rocket-player-stats]:grid",
  // base · & .rocket-player-stats>div
  "[&_.rocket-player-stats>div]:[background:#162132] [&_.rocket-player-stats>div]:[border:1px_solid_#243246] [&_.rocket-player-stats>div]:[border-radius:9px] [&_.rocket-player-stats>div]:[min-width:0] [&_.rocket-player-stats>div]:[padding:8px_10px]",
  // base · & .rocket-player-stats small
  "[&_.rocket-player-stats_small]:[color:#8091aa] [&_.rocket-player-stats_small]:[margin-bottom:5px] [&_.rocket-player-stats_small]:[font-size:10px] [&_.rocket-player-stats_small]:block",
  // base · & .rocket-player-stats strong
  "[&_.rocket-player-stats_strong]:[font-variant-numeric:tabular-nums] [&_.rocket-player-stats_strong]:[overflow-wrap:anywhere] [&_.rocket-player-stats_strong]:[font-size:16px]",
  // base · & .rocket-player-gain
  "[&_.rocket-player-gain]:[color:#7be9c5]",
  // base · & .rocket-player-amounts
  "[&_.rocket-player-amounts]:[flex-wrap:wrap] [&_.rocket-player-amounts]:items-center [&_.rocket-player-amounts]:[gap:6px] [&_.rocket-player-amounts]:flex",
  // base · & .rocket-player-amounts label
  "[&_.rocket-player-amounts_label]:[color:#7d92ab] [&_.rocket-player-amounts_label]:[background:#131f30] [&_.rocket-player-amounts_label]:[border:1px_solid_#2c3b51] [&_.rocket-player-amounts_label]:[border-radius:8px] [&_.rocket-player-amounts_label]:[flex:100%] [&_.rocket-player-amounts_label]:items-center [&_.rocket-player-amounts_label]:[min-width:0] [&_.rocket-player-amounts_label]:[height:40px] [&_.rocket-player-amounts_label]:[padding-left:9px] [&_.rocket-player-amounts_label]:[font-size:12px] [&_.rocket-player-amounts_label]:flex",
  // base · & .rocket-player-amounts input
  "[&_.rocket-player-amounts_input]:text-right [&_.rocket-player-amounts_input]:w-full [&_.rocket-player-amounts_input]:[min-width:0] [&_.rocket-player-amounts_input]:font-semibold [&_.rocket-player-amounts_input]:[color:#edf5fb]! [&_.rocket-player-amounts_input]:[box-shadow:none]! [&_.rocket-player-amounts_input]:[background:0_0]! [&_.rocket-player-amounts_input]:[border:0]! [&_.rocket-player-amounts_input]:[padding:0_9px]! [&_.rocket-player-amounts_input]:[font-size:16px]!",
  // base · & .rocket-player-amounts button
  "[&_.rocket-player-amounts_button]:[color:#a8bad0] [&_.rocket-player-amounts_button]:[background:#192739] [&_.rocket-player-amounts_button]:[border:1px_solid_#2b3c50] [&_.rocket-player-amounts_button]:[border-radius:8px] [&_.rocket-player-amounts_button]:[flex:1] [&_.rocket-player-amounts_button]:[min-width:45px] [&_.rocket-player-amounts_button]:[height:40px] [&_.rocket-player-amounts_button]:[padding:0_7px] [&_.rocket-player-amounts_button]:[font-size:12px]",
  // base · & .rocket-player-amounts button:disabled
  "[&_.rocket-player-amounts_button:disabled]:[opacity:.4]",
  // base · & .rocket-player-bottom
  "[&_.rocket-player-bottom]:[gap:7px] [&_.rocket-player-bottom]:grid",
  // base · & .rocket-player-shell .rocket-player-action
  "[&_.rocket-player-shell_.rocket-player-action]:[color:#0c3029] [&_.rocket-player-shell_.rocket-player-action]:text-left [&_.rocket-player-shell_.rocket-player-action]:[background:linear-gradient(110deg,#a4f4c6,#6ddfc3)] [&_.rocket-player-shell_.rocket-player-action]:[border:1px_solid_#99f5d0] [&_.rocket-player-shell_.rocket-player-action]:[border-radius:10px] [&_.rocket-player-shell_.rocket-player-action]:justify-between [&_.rocket-player-shell_.rocket-player-action]:items-center [&_.rocket-player-shell_.rocket-player-action]:[gap:5px] [&_.rocket-player-shell_.rocket-player-action]:w-full [&_.rocket-player-shell_.rocket-player-action]:[height:48px] [&_.rocket-player-shell_.rocket-player-action]:[min-height:54px] [&_.rocket-player-shell_.rocket-player-action]:[padding:0_13px] [&_.rocket-player-shell_.rocket-player-action]:flex",
  // base · & .rocket-player-action strong
  "[&_.rocket-player-action_strong]:[font-size:15px]",
  // base · & .rocket-player-action small
  "[&_.rocket-player-action_small]:[color:#28624c] [&_.rocket-player-action_small]:[margin-top:3px] [&_.rocket-player-action_small]:[font-size:9px] [&_.rocket-player-action_small]:block",
  // base · & .rocket-player-action>b
  "[&_.rocket-player-action>b]:whitespace-nowrap [&_.rocket-player-action>b]:[font-size:16px]",
  // base · & .rocket-player-shell .rocket-player-action:disabled
  "[&_.rocket-player-shell_.rocket-player-action:disabled]:[color:#a2b4c9] [&_.rocket-player-shell_.rocket-player-action:disabled]:[background:#202e40] [&_.rocket-player-shell_.rocket-player-action:disabled]:[border-color:#344456]",
  // base · & .rocket-player-action:disabled small
  "[&_.rocket-player-action:disabled_small]:[color:#758ba3]",
  // base · & .rocket-player-bottom p
  "[&_.rocket-player-bottom_p]:text-center [&_.rocket-player-bottom_p]:[color:#6b7d94] [&_.rocket-player-bottom_p]:whitespace-nowrap [&_.rocket-player-bottom_p]:m-0! [&_.rocket-player-bottom_p]:[font-size:8px]! [&_.rocket-player-bottom_p]:[line-height:1.3]!",
  // base · & .rocket-player-error
  "[&_.rocket-player-error]:[z-index:4] [&_.rocket-player-error]:[color:#ffd5d0] [&_.rocket-player-error]:[background:#442a35] [&_.rocket-player-error]:[border:1px_solid_#885265] [&_.rocket-player-error]:[border-radius:8px] [&_.rocket-player-error]:justify-between [&_.rocket-player-error]:items-center [&_.rocket-player-error]:[gap:8px] [&_.rocket-player-error]:[padding:10px] [&_.rocket-player-error]:[font-size:11px] [&_.rocket-player-error]:flex [&_.rocket-player-error]:absolute [&_.rocket-player-error]:[top:47px] [&_.rocket-player-error]:[left:15px] [&_.rocket-player-error]:[right:15px]",
  // base · & .rocket-player-error button
  "[&_.rocket-player-error_button]:[color:inherit] [&_.rocket-player-error_button]:[background:0_0] [&_.rocket-player-error_button]:[border:0] [&_.rocket-player-error_button]:[font-size:18px]",
  // base · & .rocket-player-help
  "[&_.rocket-player-help]:[color:#e3edf7] [&_.rocket-player-help]:[background:#111d2d] [&_.rocket-player-help]:[border:1px_solid_#3c5067] [&_.rocket-player-help]:[border-radius:18px] [&_.rocket-player-help]:[width:calc(100%_-_32px)] [&_.rocket-player-help]:[max-width:420px] [&_.rocket-player-help]:[height:fit-content] [&_.rocket-player-help]:[max-height:85dvh] [&_.rocket-player-help]:[margin:auto] [&_.rocket-player-help]:[padding:20px] [&_.rocket-player-help]:fixed [&_.rocket-player-help]:[inset:0] [&_.rocket-player-help]:overflow-auto",
  // base · & .rocket-player-help::backdrop
  "[&_.rocket-player-help::backdrop]:[backdrop-filter:blur(6px)] [&_.rocket-player-help::backdrop]:[background:#050b15bb]",
  // base · & .rocket-player-help header
  "[&_.rocket-player-help_header]:justify-between [&_.rocket-player-help_header]:items-center [&_.rocket-player-help_header]:[gap:10px] [&_.rocket-player-help_header]:flex",
  // base · & .rocket-player-help h2
  "[&_.rocket-player-help_h2]:[color:inherit] [&_.rocket-player-help_h2]:[font-size:20px]!",
  // base · & .rocket-player-help h3
  "[&_.rocket-player-help_h3]:[color:inherit] [&_.rocket-player-help_h3]:[font-size:14px]",
  // base · & .rocket-player-help p
  "[&_.rocket-player-help_p]:[color:#94a8bd] [&_.rocket-player-help_p]:[margin:12px_0]! [&_.rocket-player-help_p]:[font-size:12px]! [&_.rocket-player-help_p]:[line-height:1.7]!",
  // base · & .rocket-player-help button
  "[&_.rocket-player-help_button]:[color:#96e9ce] [&_.rocket-player-help_button]:[background:#203c3a] [&_.rocket-player-help_button]:[border:1px_solid_#467468] [&_.rocket-player-help_button]:[border-radius:7px] [&_.rocket-player-help_button]:[padding:8px_12px] [&_.rocket-player-help_button]:[font-size:11px]",
  // (max-height:720px) · & .rocket-player-game
  "[@media_(max-height:720px)]:[&_.rocket-player-game]:[gap:6px] [@media_(max-height:720px)]:[&_.rocket-player-game]:[padding:12px_14px_8px]",
  // (max-height:720px) · & .rocket-player-stats>div
  "[@media_(max-height:720px)]:[&_.rocket-player-stats>div]:[padding:6px_9px]",
  // (max-height:720px) · & .rocket-player-stats small
  "[@media_(max-height:720px)]:[&_.rocket-player-stats_small]:[margin-bottom:3px]",
  // (max-height:720px) · & .rocket-player-shell .rocket-player-action
  "[@media_(max-height:720px)]:[&_.rocket-player-shell_.rocket-player-action]:[height:43px]",
  // (max-height:720px) · & .rocket-player-rocket
  "[@media_(max-height:720px)]:[&_.rocket-player-rocket]:[width:min(35px,19cqh)] [@media_(max-height:720px)]:[&_.rocket-player-rocket]:[height:min(53px,28cqh)]",
  // (max-height:560px) · & .rocket-player-game
  "[@media_(max-height:560px)]:[&_.rocket-player-game]:[grid-template-rows:auto_minmax(40px,1fr)_auto_auto_auto] [@media_(max-height:560px)]:[&_.rocket-player-game]:[gap:4px]",
  // (max-height:560px) · & .rocket-player-history
  "[@media_(max-height:560px)]:[&_.rocket-player-history]:hidden",
  // (max-height:560px) · & .rocket-player-stats>div
  "[@media_(max-height:560px)]:[&_.rocket-player-stats>div]:[padding:5px_8px]",
  // (max-height:560px) · & .rocket-player-shell .rocket-player-action
  "[@media_(max-height:560px)]:[&_.rocket-player-shell_.rocket-player-action]:[height:36px]",
  // (max-height:560px) · & .rocket-player-bottom p
  "[@media_(max-height:560px)]:[&_.rocket-player-bottom_p]:[font-size:7px]!",
  // (max-height:560px) · & .rocket-player-multiplier
  "[@media_(max-height:560px)]:[&_.rocket-player-multiplier]:[top:26%] [@media_(max-height:560px)]:[&_.rocket-player-multiplier]:[left:12px]",
  // (max-height:560px) · & .rocket-player-multiplier strong
  "[@media_(max-height:560px)]:[&_.rocket-player-multiplier_strong]:[font-size:27px]",
  // (max-height:560px) · & .rocket-player-flightTop
  "[@media_(max-height:560px)]:[&_.rocket-player-flightTop]:[top:6px]",
  // (max-height:560px) · & .rocket-player-rocket
  "[@media_(max-height:560px)]:[&_.rocket-player-rocket]:[width:min(27px,19cqh)] [@media_(max-height:560px)]:[&_.rocket-player-rocket]:[height:min(40px,28cqh)]",
  // (max-height:560px) · & .rocket-player-flightStatus
  "[@media_(max-height:560px)]:[&_.rocket-player-flightStatus]:[bottom:5px]",
  // (max-height:560px) · & .rocket-player-amounts label
  "[@media_(max-height:560px)]:[&_.rocket-player-amounts_label]:[height:28px]",
  // (max-height:560px) · & .rocket-player-amounts button
  "[@media_(max-height:560px)]:[&_.rocket-player-amounts_button]:[height:28px]",
  // (max-height:560px) · & .rocket-player-context h2
  "[@media_(max-height:560px)]:[&_.rocket-player-context_h2]:[font-size:21px]!",
  // (max-height:560px) · & .rocket-player-context
  "[@media_(max-height:560px)]:[&_.rocket-player-context]:[gap:5px]",
  // (prefers-reduced-motion:reduce) · & .rocket-player-fire
  "[@media_(prefers-reduced-motion:reduce)]:[&_.rocket-player-fire]:[animation:none]",
  // (prefers-reduced-motion:reduce) · & .rocket-player-rocket
  "[@media_(prefers-reduced-motion:reduce)]:[&_.rocket-player-rocket]:[will-change:auto]",
  // base · & .rocket-player-header>button
  "[&_.rocket-player-header>button]:[width:auto] [&_.rocket-player-header>button]:[min-width:36px] [&_.rocket-player-header>button]:[height:36px] [&_.rocket-player-header>button]:[padding:6px_9px]",
  // base · & .rocket-player-help li
  "[&_.rocket-player-help_li]:[margin:12px_0] [&_.rocket-player-help_li]:[font-size:14px] [&_.rocket-player-help_li]:[line-height:1.6]",
  // base · & .rocket-player-help ol
  "[&_.rocket-player-help_ol]:[padding-left:20px]",
  // base · & .rocket-player-help summary
  "[&_.rocket-player-help_summary]:cursor-pointer",
].join(" ");

export default {
  "shell": "rocket-player-shell",
  "context": "rocket-player-context",
  "game": "rocket-player-game",
  "header": "rocket-player-header",
  "history": "rocket-player-history",
  "high": "rocket-player-high",
  "flight": "rocket-player-flight",
  "flightTop": "rocket-player-flightTop",
  "multiplier": "rocket-player-multiplier",
  "scene": "rocket-player-scene",
  "trail": "rocket-player-trail",
  "rocket": "rocket-player-rocket",
  "fire": "rocket-player-fire",
  "altitude": "rocket-player-altitude",
  "flightStatus": "rocket-player-flightStatus",
  "crashed": "rocket-player-crashed",
  "stats": "rocket-player-stats",
  "gain": "rocket-player-gain",
  "amounts": "rocket-player-amounts",
  "bottom": "rocket-player-bottom",
  "action": "rocket-player-action",
  "error": "rocket-player-error",
  "help": "rocket-player-help"
};
