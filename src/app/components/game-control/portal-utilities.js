// Tailwind utility classes. Keep every candidate literal so the compiler can discover it.
export const portalUtilities = [
  // base · &
  "[--surface:#fff] [--ink:#202523] [--muted:#7c837e] [--line:#e7ebe7] [--purple:#8270ce] [--danger:#bd4f52] [--radius:13px] [background:var(--bg)] [color:var(--ink)] [--bg:#f4f8f7] [--lime:#0c796b] [--lime-dark:#075e54] m-0 [font-family:Arial,sans-serif] [font-size:16px]",
  // base · & *
  "[&_*]:box-border",
  // base · & button
  "[&_button]:[font:inherit] [&_button]:[outline-offset:4px] [&_button]:[-webkit-tap-highlight-color:transparent] [&_button]:cursor-pointer [&_button]:[color:inherit]",
  // base · & input
  "[&_input]:[font:inherit] [&_input]:[outline-offset:4px]",
  // base · & select
  "[&_select]:[font:inherit] [&_select]:[outline-offset:4px] [&_select]:[border:1px_solid_var(--line)] [&_select]:[color:#596352] [&_select]:[background:#fff] [&_select]:[border-radius:7px] [&_select]:[max-width:100%] [&_select]:[min-height:40px] [&_select]:[padding:10px_30px_10px_12px] [&_select]:[font-size:14px]",
  // base · & a
  "[&_a]:[outline-offset:4px] [&_a]:[-webkit-tap-highlight-color:transparent] [&_a]:[color:inherit] [&_a]:[text-decoration:none]",
  // base · & button:disabled
  "[&_button:disabled]:cursor-not-allowed [&_button:disabled]:[opacity:.5]",
  // base · & h1
  "[&_h1]:[letter-spacing:-1.15px] [&_h1]:m-0 [&_h1]:[font-family:Manrope,Arial,sans-serif] [&_h1]:[font-size:29px] [&_h1]:[font-weight:750]",
  // base · & h2
  "[&_h2]:m-0 [&_h2]:[font-family:Manrope,Arial,sans-serif]",
  // base · & h3
  "[&_h3]:m-0 [&_h3]:[font-family:Manrope,Arial,sans-serif]",
  // base · & p
  "[&_p]:m-0",
  // base · & strong
  "[&_strong]:[font-family:Manrope,Arial,sans-serif]",
  // base · & .app-shell
  "[&_.app-shell]:[min-height:100vh] [&_.app-shell]:flex",
  // base · & .sidebar
  "[&_.sidebar]:[border-right:1px_solid_var(--line)] [&_.sidebar]:[color:#fff] [&_.sidebar]:[background:#073f38] [&_.sidebar]:flex-col [&_.sidebar]:[flex-shrink:0] [&_.sidebar]:[width:256px] [&_.sidebar]:[padding:30px_20px_18px] [&_.sidebar]:flex [&_.sidebar]:fixed [&_.sidebar]:[inset:0_auto_0_0] [&_.sidebar]:[overflow-y:auto]",
  // base · & .brand
  "[&_.brand]:[letter-spacing:-1.4px] [&_.brand]:items-center [&_.brand]:[gap:10px] [&_.brand]:[padding:0_12px] [&_.brand]:[font:800_28px_Manrope,sans-serif] [&_.brand]:flex",
  // base · & .brand-mark
  "[&_.brand-mark]:[background:var(--lime)] [&_.brand-mark]:[color:#fff] [&_.brand-mark]:[letter-spacing:0] [&_.brand-mark]:[border-radius:10px] [&_.brand-mark]:[place-items:center] [&_.brand-mark]:[width:34px] [&_.brand-mark]:[height:34px] [&_.brand-mark]:p-0 [&_.brand-mark]:[font-size:23px] [&_.brand-mark]:grid",
  // base · & .brand-live
  "[&_.brand-live]:[letter-spacing:-1px] [&_.brand-live]:[margin-left:3px] [&_.brand-live]:[font-size:21px] [&_.brand-live]:font-medium",
  // base · & .workspace
  "[&_.workspace]:[border:1px_solid_var(--line)] [&_.workspace]:[border-radius:9px] [&_.workspace]:items-center [&_.workspace]:[gap:10px] [&_.workspace]:[margin:27px_0_21px] [&_.workspace]:[padding:17px_10px] [&_.workspace]:[font-size:14px] [&_.workspace]:flex",
  // base · & .workspace b
  "[&_.workspace_b]:font-semibold [&_.workspace_b]:block",
  // base · & .workspace small
  "[&_.workspace_small]:[color:#b5d6d0] [&_.workspace_small]:[margin-top:4px] [&_.workspace_small]:[font-size:12px] [&_.workspace_small]:block",
  // base · & .workspace-icon
  "[&_.workspace-icon]:[color:#fff] [&_.workspace-icon]:[background:#ffffff0d] [&_.workspace-icon]:[border-color:#ffffff20] [&_.workspace-icon]:[border-radius:8px] [&_.workspace-icon]:[place-items:center] [&_.workspace-icon]:[padding:9px] [&_.workspace-icon]:grid",
  // base · & .workspace>svg
  "[&_.workspace>svg]:[margin-left:auto]",
  // base · & .nav-label
  "[&_.nav-label]:[letter-spacing:1.3px] [&_.nav-label]:[color:#b5d6d0] [&_.nav-label]:[margin-bottom:13px] [&_.nav-label]:[padding:0_13px] [&_.nav-label]:[font-size:12px]",
  // base · & .nav-item
  "[&_.nav-item]:text-left [&_.nav-item]:[color:#b5d6d0] [&_.nav-item]:[background:0_0] [&_.nav-item]:[border:0] [&_.nav-item]:[border-radius:8px] [&_.nav-item]:items-center [&_.nav-item]:[gap:12px] [&_.nav-item]:w-full [&_.nav-item]:[margin:3px_0] [&_.nav-item]:[padding:13px_12px] [&_.nav-item]:[font-size:14px] [&_.nav-item]:font-medium [&_.nav-item]:flex",
  // base · & .nav-item.selected
  "[&_.nav-item.selected]:[color:#62e0d0] [&_.nav-item.selected]:[background:#ffffff18]",
  // base · & .nav-item:hover
  "[&_.nav-item:hover]:[color:#62e0d0] [&_.nav-item:hover]:[background:#ffffff18]",
  // base · & .nav-count
  "[&_.nav-count]:[background:#e8ebe5] [&_.nav-count]:[border-radius:4px] [&_.nav-count]:[margin-left:auto] [&_.nav-count]:[padding:2px_6px] [&_.nav-count]:[font-size:12px]",
  // base · & .sidebar-bottom
  "[&_.sidebar-bottom]:[margin-top:auto] [&_.sidebar-bottom]:[padding-top:20px]",
  // base · & .sandbox-card
  "[&_.sandbox-card]:[color:#fff] [&_.sandbox-card]:[background:#ffffff0d] [&_.sandbox-card]:[border:1px_solid_#ffffff20] [&_.sandbox-card]:[border-radius:10px] [&_.sandbox-card]:[padding:16px] [&_.sandbox-card]:[font-size:13px]",
  // base · & .sandbox-card>b
  "[&_.sandbox-card>b]:[margin:13px_0_7px] [&_.sandbox-card>b]:[font-size:14px] [&_.sandbox-card>b]:block",
  // base · & .sandbox-card p
  "[&_.sandbox-card_p]:[color:#b5d6d0] [&_.sandbox-card_p]:[font-size:14px] [&_.sandbox-card_p]:[line-height:1.6]",
  // base · & .sandbox-card a
  "[&_.sandbox-card_a]:justify-between [&_.sandbox-card_a]:items-center [&_.sandbox-card_a]:[margin-top:15px] [&_.sandbox-card_a]:[font-size:14px] [&_.sandbox-card_a]:font-semibold [&_.sandbox-card_a]:flex",
  // base · & .admin-profile
  "[&_.admin-profile]:[border-top:1px_solid_var(--line)] [&_.admin-profile]:items-center [&_.admin-profile]:[gap:11px] [&_.admin-profile]:[margin-top:24px] [&_.admin-profile]:[padding:22px_5px_0] [&_.admin-profile]:[font-size:13px] [&_.admin-profile]:flex",
  // base · & .avatar
  "[&_.avatar]:[color:#78658c] [&_.avatar]:[background:#ece9f3] [&_.avatar]:[border:3px_solid_#fff] [&_.avatar]:rounded-full [&_.avatar]:[place-items:center] [&_.avatar]:[width:37px] [&_.avatar]:[height:37px] [&_.avatar]:font-semibold [&_.avatar]:grid",
  // base · & .top-avatar
  "[&_.top-avatar]:[color:#78658c] [&_.top-avatar]:[background:#ece9f3] [&_.top-avatar]:[border:3px_solid_#fff] [&_.top-avatar]:rounded-full [&_.top-avatar]:[place-items:center] [&_.top-avatar]:[width:37px] [&_.top-avatar]:[height:37px] [&_.top-avatar]:font-semibold [&_.top-avatar]:grid",
  // base · & .admin-profile small
  "[&_.admin-profile_small]:[color:#b5d6d0] [&_.admin-profile_small]:[margin-top:3px] [&_.admin-profile_small]:[font-size:12px] [&_.admin-profile_small]:block",
  // base · & main
  "[&_main]:[width:calc(100%_-_248px)] [&_main]:[margin-left:248px]",
  // base · & .topbar
  "[&_.topbar]:[border-bottom:1px_solid_var(--line)] [&_.topbar]:[color:#8a918b] [&_.topbar]:[background:#fff] [&_.topbar]:justify-between [&_.topbar]:items-center [&_.topbar]:[height:78px] [&_.topbar]:[padding:0_36px] [&_.topbar]:[font-size:14px] [&_.topbar]:flex",
  // base · & .topbar b
  "[&_.topbar_b]:[color:#4c544e] [&_.topbar_b]:font-medium",
  // base · & .slash
  "[&_.slash]:[color:#c6cbc7] [&_.slash]:[padding:0_13px]",
  // base · & .top-actions
  "[&_.top-actions]:items-center [&_.top-actions]:[gap:22px] [&_.top-actions]:flex",
  // base · & .demo-pill
  "[&_.demo-pill]:[color:#767957] [&_.demo-pill]:[background:#f4f5ed] [&_.demo-pill]:[border-radius:6px] [&_.demo-pill]:items-center [&_.demo-pill]:[gap:6px] [&_.demo-pill]:[padding:6px_10px] [&_.demo-pill]:[font-size:12px] [&_.demo-pill]:flex",
  // base · & .page-content
  "[&_.page-content]:[max-width:1600px] [&_.page-content]:[margin:auto] [&_.page-content]:[padding:35px_36px_18px]",
  // base · & .page-heading
  "[&_.page-heading]:justify-between [&_.page-heading]:items-center [&_.page-heading]:[gap:16px] [&_.page-heading]:[margin-bottom:27px] [&_.page-heading]:flex",
  // base · & .eyebrow
  "[&_.eyebrow]:[letter-spacing:1.7px] [&_.eyebrow]:[color:#899185] [&_.eyebrow]:[margin-bottom:9px] [&_.eyebrow]:[font-size:12px] [&_.eyebrow]:font-semibold",
  // base · & .page-heading p
  "[&_.page-heading_p]:[color:var(--muted)] [&_.page-heading_p]:[margin-top:9px] [&_.page-heading_p]:[font-size:14px]",
  // base · & .button
  "[&_.button]:[background:#fff] [&_.button]:[border:1px_solid_#dfe4dd] [&_.button]:[border-radius:7px] [&_.button]:justify-center [&_.button]:items-center [&_.button]:[gap:8px] [&_.button]:[min-height:39px] [&_.button]:[padding:10px_14px] [&_.button]:[font-size:14px] [&_.button]:[font-weight:550] [&_.button]:inline-flex",
  // base · & .button.primary
  "[&_.button.primary]:[background:var(--lime)] [&_.button.primary]:[border-color:var(--lime)] [&_.button.primary]:[color:#fff]",
  // base · & .button.primary:hover
  "[&_.button.primary:hover]:[background:#08685c]",
  // base · & .button.subtle
  "[&_.button.subtle]:[background:#fff] [&_.button.subtle]:[min-height:33px] [&_.button.subtle]:[padding:7px_11px] [&_.button.subtle]:[font-size:14px]",
  // base · & .text-button
  "[&_.text-button]:[color:#5c6e46] [&_.text-button]:[background:0_0] [&_.text-button]:[border:0] [&_.text-button]:items-center [&_.text-button]:[gap:8px] [&_.text-button]:p-0 [&_.text-button]:[font-size:14px] [&_.text-button]:font-semibold [&_.text-button]:inline-flex",
  // base · & .notice
  "[&_.notice]:[color:#75805f] [&_.notice]:[background:#f1f5e9] [&_.notice]:[border:1px_solid_#e6eadc] [&_.notice]:[border-radius:8px] [&_.notice]:items-center [&_.notice]:[gap:10px] [&_.notice]:[margin-bottom:25px] [&_.notice]:[padding:11px_14px] [&_.notice]:[font-size:14px] [&_.notice]:[line-height:1.6] [&_.notice]:flex",
  // base · & .notice>b
  "[&_.notice>b]:font-medium",
  // base · & .notice>svg
  "[&_.notice>svg]:[flex-shrink:0]",
  // base · & .notice button
  "[&_.notice_button]:whitespace-nowrap [&_.notice_button]:[color:#5c6e46] [&_.notice_button]:[background:0_0] [&_.notice_button]:[border:0] [&_.notice_button]:items-center [&_.notice_button]:[gap:6px] [&_.notice_button]:[margin-left:auto] [&_.notice_button]:[font-size:14px] [&_.notice_button]:flex",
  // base · & .metrics
  "[&_.metrics]:[grid-template-columns:repeat(4,1fr)] [&_.metrics]:[gap:17px] [&_.metrics]:[margin-bottom:23px] [&_.metrics]:grid",
  // base · & .metric
  "[&_.metric]:[border:1px_solid_var(--line)] [&_.metric]:[border-radius:var(--radius)] [&_.metric]:[background:#fff] [&_.metric]:[min-width:0] [&_.metric]:[padding:20px]",
  // base · & .metric>div
  "[&_.metric>div]:[color:#808980] [&_.metric>div]:justify-between [&_.metric>div]:[align-items:start] [&_.metric>div]:[gap:8px] [&_.metric>div]:[font-size:14px] [&_.metric>div]:flex",
  // base · & .metric>div>svg
  "[&_.metric>div>svg]:[color:#9aa596]",
  // base · & .metric strong
  "[&_.metric_strong]:[letter-spacing:-1px] [&_.metric_strong]:[margin:13px_0_6px] [&_.metric_strong]:[font-size:30px] [&_.metric_strong]:[font-weight:750] [&_.metric_strong]:block",
  // base · & .metric small
  "[&_.metric_small]:[color:#8c9589] [&_.metric_small]:[font-size:12px] [&_.metric_small]:[line-height:1.7] [&_.metric_small]:block",
  // base · & .overview-grid
  "[&_.overview-grid]:[grid-template-columns:1.8fr_1fr] [&_.overview-grid]:[gap:22px] [&_.overview-grid]:grid",
  // base · & .panel
  "[&_.panel]:[border:1px_solid_var(--line)] [&_.panel]:[border-radius:var(--radius)] [&_.panel]:[background:#fff] [&_.panel]:[margin-bottom:23px] [&_.panel]:overflow-hidden",
  // base · & .panel-heading
  "[&_.panel-heading]:justify-between [&_.panel-heading]:items-center [&_.panel-heading]:[gap:16px] [&_.panel-heading]:[padding:23px_24px] [&_.panel-heading]:flex",
  // base · & .panel-heading h2
  "[&_.panel-heading_h2]:[letter-spacing:-.3px] [&_.panel-heading_h2]:[font-size:17px] [&_.panel-heading_h2]:[font-weight:750]",
  // base · & .panel-heading p
  "[&_.panel-heading_p]:[color:#8d958d] [&_.panel-heading_p]:[margin-top:7px] [&_.panel-heading_p]:[font-size:14px]",
  // base · & .chart-legend
  "[&_.chart-legend]:[color:#8a9288] [&_.chart-legend]:whitespace-nowrap [&_.chart-legend]:items-center [&_.chart-legend]:[gap:5px] [&_.chart-legend]:[font-size:12px] [&_.chart-legend]:flex",
  // base · & .chart-legend i
  "[&_.chart-legend_i]:[background:#b6db82] [&_.chart-legend_i]:[border-radius:2px] [&_.chart-legend_i]:[width:7px] [&_.chart-legend_i]:[height:7px]",
  // base · & .chart-legend i.payout
  "[&_.chart-legend_i.payout]:[background:#dfe8d7] [&_.chart-legend_i.payout]:[margin-left:9px]",
  // base · & .bar-chart
  "[&_.bar-chart]:[background:repeating-linear-gradient(0deg,#0000_0_49px,#f1f3ef_49px_50px)] [&_.bar-chart]:[align-items:end] [&_.bar-chart]:[gap:13px] [&_.bar-chart]:[height:233px] [&_.bar-chart]:[margin:4px_25px_15px] [&_.bar-chart]:[padding-top:10px] [&_.bar-chart]:flex",
  // base · & .bar-group
  "[&_.bar-group]:flex-col [&_.bar-group]:[flex:1] [&_.bar-group]:[justify-content:end] [&_.bar-group]:[min-width:0] [&_.bar-group]:h-full [&_.bar-group]:flex",
  // base · & .bar-pair
  "[&_.bar-pair]:[align-items:end] [&_.bar-pair]:[gap:3px] [&_.bar-pair]:h-full [&_.bar-pair]:[padding-top:5px] [&_.bar-pair]:flex",
  // base · & .bar-pair span
  "[&_.bar-pair_span]:[background:#b6db82] [&_.bar-pair_span]:[border-radius:4px_4px_0_0] [&_.bar-pair_span]:[flex:1] [&_.bar-pair_span]:[min-height:3px] [&_.bar-pair_span]:[max-height:100%]",
  // base · & .bar-pair span+span
  "[&_.bar-pair_span+span]:[background:#e1e9d9]",
  // base · & .bar-group small
  "[&_.bar-group_small]:text-center [&_.bar-group_small]:[color:#9ca49a] [&_.bar-group_small]:[background:#fff] [&_.bar-group_small]:[margin-top:12px] [&_.bar-group_small]:[padding-top:4px] [&_.bar-group_small]:[font-size:12px] [&_.bar-group_small]:block",
  // base · & .tiny-label
  "[&_.tiny-label]:[letter-spacing:1px] [&_.tiny-label]:[color:#7e896e] [&_.tiny-label]:[background:#f2f4ec] [&_.tiny-label]:[border:1px_solid_#e7ebdf] [&_.tiny-label]:[border-radius:4px] [&_.tiny-label]:[padding:4px_6px] [&_.tiny-label]:[font-size:12px]",
  // base · & .health-panel
  "[&_.health-panel]:[padding-bottom:20px]",
  // base · & .health-number
  "[&_.health-number]:items-center [&_.health-number]:[gap:17px] [&_.health-number]:[padding:0_24px] [&_.health-number]:flex",
  // base · & .health-number strong
  "[&_.health-number_strong]:[letter-spacing:-2px] [&_.health-number_strong]:[font-size:46px] [&_.health-number_strong]:[font-weight:650]",
  // base · & .health-number strong span
  "[&_.health-number_strong_span]:[margin-left:3px] [&_.health-number_strong_span]:[font-size:25px]",
  // base · & .health-number p
  "[&_.health-number_p]:[color:#909987] [&_.health-number_p]:[font-size:12px] [&_.health-number_p]:[line-height:1.6]",
  // base · & .health-number b
  "[&_.health-number_b]:[color:#546145] [&_.health-number_b]:font-medium",
  // base · & .probability-track
  "[&_.probability-track]:[background:#e6ecdc] [&_.probability-track]:[border-radius:8px] [&_.probability-track]:[height:7px] [&_.probability-track]:[margin:18px_24px_9px] [&_.probability-track]:overflow-hidden",
  // base · & .probability-track span
  "[&_.probability-track_span]:[background:#aacc74] [&_.probability-track_span]:[border-radius:8px] [&_.probability-track_span]:h-full [&_.probability-track_span]:block",
  // base · & .split-label
  "[&_.split-label]:[color:#8f9887] [&_.split-label]:justify-between [&_.split-label]:[margin:0_24px_17px] [&_.split-label]:[font-size:12px] [&_.split-label]:flex",
  // base · & .health-stat
  "[&_.health-stat]:[color:#8a9383] [&_.health-stat]:[border-top:1px_solid_#f1f2ed] [&_.health-stat]:justify-between [&_.health-stat]:[margin:0_24px] [&_.health-stat]:[padding:10px_0] [&_.health-stat]:[font-size:14px] [&_.health-stat]:flex",
  // base · & .health-stat b
  "[&_.health-stat_b]:[color:#46513b] [&_.health-stat_b]:font-medium",
  // base · & .health-panel>.text-button
  "[&_.health-panel>.text-button]:[margin:12px_24px_0]",
  // base · & .count-badge
  "[&_.count-badge]:[color:#7c8770] [&_.count-badge]:[background:#f1f3ed] [&_.count-badge]:[border:1px_solid_#e9ece4] [&_.count-badge]:[border-radius:4px] [&_.count-badge]:[margin-left:7px] [&_.count-badge]:[padding:2px_6px] [&_.count-badge]:[font-family:DM_Sans,sans-serif] [&_.count-badge]:[font-size:11px]",
  // base · & .game-row
  "[&_.game-row]:[border-top:1px_solid_#eff1ed] [&_.game-row]:items-center [&_.game-row]:[gap:16px] [&_.game-row]:[padding:17px_24px] [&_.game-row]:flex",
  // base · & .game-icon
  "[&_.game-icon]:[border-radius:11px] [&_.game-icon]:[flex-shrink:0] [&_.game-icon]:[place-items:center] [&_.game-icon]:[width:44px] [&_.game-icon]:[height:44px] [&_.game-icon]:grid",
  // base · & .game-icon.purple
  "[&_.game-icon.purple]:[color:#9b82ca] [&_.game-icon.purple]:[background:#f0ebfb]",
  // base · & .game-icon.orange
  "[&_.game-icon.orange]:[color:#d8a561] [&_.game-icon.orange]:[background:#fff0df]",
  // base · & .game-name
  "[&_.game-name]:[width:22%] [&_.game-name]:[min-width:120px]",
  // base · & .game-name b
  "[&_.game-name_b]:[font-size:14px] [&_.game-name_b]:[font-weight:550]",
  // base · & .game-name small
  "[&_.game-name_small]:[color:#949b90] [&_.game-name_small]:[margin-top:6px] [&_.game-name_small]:[font-size:12px] [&_.game-name_small]:block",
  // base · & .status
  "[&_.status]:[color:#a19a86] [&_.status]:[background:#f4f3ef] [&_.status]:[border-radius:5px] [&_.status]:[padding:4px_7px] [&_.status]:[font-size:12px]",
  // base · & .status.active
  "[&_.status.active]:[color:#7f9b59] [&_.status.active]:[background:#edf5e5]",
  // base · & .game-stat
  "[&_.game-stat]:[min-width:85px] [&_.game-stat]:[margin-left:auto]",
  // base · & .game-stat small
  "[&_.game-stat_small]:[color:#98a18e] [&_.game-stat_small]:[margin-bottom:6px] [&_.game-stat_small]:[font-size:12px] [&_.game-stat_small]:block",
  // base · & .game-stat b
  "[&_.game-stat_b]:[font-size:14px] [&_.game-stat_b]:font-medium",
  // base · & .game-row>.button
  "[&_.game-row>.button]:[margin-left:15px]",
  // base · & .table-scroll
  "[&_.table-scroll]:overflow-auto",
  // base · & table
  "[&_table]:[border-collapse:collapse] [&_table]:text-left [&_table]:whitespace-nowrap [&_table]:w-full",
  // base · & th
  "[&_th]:[letter-spacing:.15px] [&_th]:[color:#899181] [&_th]:[background:#fafbf8] [&_th]:[border-block:1px_solid_#eff2e9] [&_th]:[padding:12px_20px] [&_th]:[font-size:12px] [&_th]:font-medium",
  // base · & td
  "[&_td]:[color:#657058] [&_td]:[border-bottom:1px_solid_#f0f3ed] [&_td]:[padding:15px_20px] [&_td]:[font-size:14px]",
  // base · & td b
  "[&_td_b]:[color:#414c38] [&_td_b]:[font-size:14px] [&_td_b]:font-medium",
  // base · & td small
  "[&_td_small]:[color:#a1a995] [&_td_small]:[margin-top:5px] [&_td_small]:[font-size:12px] [&_td_small]:block",
  // base · & tbody tr:last-child td
  "[&_tbody_tr:last-child_td]:[border-bottom:0]",
  // base · & .outcome
  "[&_.outcome]:[border-radius:4px] [&_.outcome]:items-center [&_.outcome]:[gap:3px] [&_.outcome]:[padding:4px_6px] [&_.outcome]:[font-size:12px] [&_.outcome]:inline-flex",
  // base · & .outcome.win
  "[&_.outcome.win]:[color:#789353] [&_.outcome.win]:[background:#f0f6e9]",
  // base · & .outcome.loss
  "[&_.outcome.loss]:[color:#b78b84] [&_.outcome.loss]:[background:#fbf1ec]",
  // base · & .settled
  "[&_.settled]:[color:#849178] [&_.settled]:[font-size:12px]",
  // base · & footer
  "[&_footer]:[letter-spacing:1px] [&_footer]:[color:#a3ab9c] [&_footer]:justify-between [&_footer]:[padding:3px_0_12px] [&_footer]:[font-size:12px] [&_footer]:flex",
  // base · & footer span
  "[&_footer_span]:[letter-spacing:0] [&_footer_span]:[font-size:12px]",
  // (min-width:1600px) · & .page-content
  "[@media_(min-width:1600px)]:[&_.page-content]:[padding-top:45px]",
  // (min-width:1600px) · & .metric strong
  "[@media_(min-width:1600px)]:[&_.metric_strong]:[font-size:34px]",
  // (max-width:1100px) · & .sidebar
  "[@media_(max-width:1100px)]:[&_.sidebar]:[width:210px] [@media_(max-width:1100px)]:[&_.sidebar]:[padding-inline:12px]",
  // (max-width:1100px) · & main
  "[@media_(max-width:1100px)]:[&_main]:[width:calc(100%_-_210px)] [@media_(max-width:1100px)]:[&_main]:[margin-left:210px]",
  // (max-width:1100px) · & .page-content
  "[@media_(max-width:1100px)]:[&_.page-content]:[padding:26px_22px]",
  // (max-width:1100px) · & .topbar
  "[@media_(max-width:1100px)]:[&_.topbar]:[padding:0_22px]",
  // (max-width:1100px) · & .game-stat
  "[@media_(max-width:1100px)]:[&_.game-stat]:[min-width:65px]",
  // (max-width:1100px) · & .game-row
  "[@media_(max-width:1100px)]:[&_.game-row]:[gap:9px] [@media_(max-width:1100px)]:[&_.game-row]:[padding-inline:18px]",
  // (max-width:1100px) · & .metrics
  "[@media_(max-width:1100px)]:[&_.metrics]:[gap:10px]",
  // (max-width:1100px) · & .metric
  "[@media_(max-width:1100px)]:[&_.metric]:[padding:15px]",
  // (max-width:1100px) · & .metric strong
  "[@media_(max-width:1100px)]:[&_.metric_strong]:[font-size:26px]",
  // (max-width:1100px) · & .bar-chart
  "[@media_(max-width:1100px)]:[&_.bar-chart]:[gap:7px]",
  // (max-width:1100px) · & .panel-heading
  "[@media_(max-width:1100px)]:[&_.panel-heading]:[padding:20px]",
  // (max-width:1100px) · & .chart-legend
  "[@media_(max-width:1100px)]:[&_.chart-legend]:[font-size:10px]",
  // (max-width:800px) · & .sidebar
  "[@media_(max-width:800px)]:[&_.sidebar]:[border-right:0] [@media_(max-width:800px)]:[&_.sidebar]:[border-bottom:1px_solid_var(--line)] [@media_(max-width:800px)]:[&_.sidebar]:w-full [@media_(max-width:800px)]:[&_.sidebar]:[padding:15px] [@media_(max-width:800px)]:[&_.sidebar]:block [@media_(max-width:800px)]:[&_.sidebar]:[position:static]",
  // (max-width:800px) · & .app-shell
  "[@media_(max-width:800px)]:[&_.app-shell]:block",
  // (max-width:800px) · & .brand
  "[@media_(max-width:800px)]:[&_.brand]:p-0 [@media_(max-width:800px)]:[&_.brand]:[font-size:24px]",
  // (max-width:800px) · & .workspace
  "[@media_(max-width:800px)]:[&_.workspace]:hidden",
  // (max-width:800px) · & .nav-label
  "[@media_(max-width:800px)]:[&_.nav-label]:hidden",
  // (max-width:800px) · & .sidebar-bottom
  "[@media_(max-width:800px)]:[&_.sidebar-bottom]:hidden",
  // (max-width:800px) · & .sidebar nav
  "[@media_(max-width:800px)]:[&_.sidebar_nav]:[gap:5px] [@media_(max-width:800px)]:[&_.sidebar_nav]:[margin-top:15px] [@media_(max-width:800px)]:[&_.sidebar_nav]:flex [@media_(max-width:800px)]:[&_.sidebar_nav]:overflow-auto",
  // (max-width:800px) · & .nav-item
  "[@media_(max-width:800px)]:[&_.nav-item]:whitespace-nowrap [@media_(max-width:800px)]:[&_.nav-item]:[width:auto] [@media_(max-width:800px)]:[&_.nav-item]:[padding:10px] [@media_(max-width:800px)]:[&_.nav-item]:[font-size:12px]",
  // (max-width:800px) · & .nav-item svg
  "[@media_(max-width:800px)]:[&_.nav-item_svg]:[width:16px]",
  // (max-width:800px) · & .nav-count
  "[@media_(max-width:800px)]:[&_.nav-count]:hidden",
  // (max-width:800px) · & main
  "[@media_(max-width:800px)]:[&_main]:w-full [@media_(max-width:800px)]:[&_main]:m-0",
  // (max-width:800px) · & .topbar
  "[@media_(max-width:800px)]:[&_.topbar]:[height:54px] [@media_(max-width:800px)]:[&_.topbar]:[padding:0_20px] [@media_(max-width:800px)]:[&_.topbar]:[font-size:12px]",
  // (max-width:800px) · & .page-content
  "[@media_(max-width:800px)]:[&_.page-content]:[padding:23px_18px_25px]",
  // (max-width:800px) · & .metrics
  "[@media_(max-width:800px)]:[&_.metrics]:[grid-template-columns:repeat(2,1fr)]",
  // (max-width:800px) · & .overview-grid
  "[@media_(max-width:800px)]:[&_.overview-grid]:[grid-template-columns:1fr]",
  // (max-width:800px) · & .notice
  "[@media_(max-width:800px)]:[&_.notice]:[flex-wrap:wrap] [@media_(max-width:800px)]:[&_.notice]:[align-items:start] [@media_(max-width:800px)]:[&_.notice]:[font-size:13px]",
  // (max-width:800px) · & .notice button
  "[@media_(max-width:800px)]:[&_.notice_button]:[margin-left:26px]",
  // (max-width:800px) · & .game-row
  "[@media_(max-width:800px)]:[&_.game-row]:[flex-wrap:wrap] [@media_(max-width:800px)]:[&_.game-row]:[gap:12px]",
  // (max-width:800px) · & .game-name
  "[@media_(max-width:800px)]:[&_.game-name]:[width:calc(100%_-_150px)] [@media_(max-width:800px)]:[&_.game-name]:[min-width:140px]",
  // (max-width:800px) · & .game-stat
  "[@media_(max-width:800px)]:[&_.game-stat]:[flex:1] [@media_(max-width:800px)]:[&_.game-stat]:[margin-left:0]",
  // (max-width:800px) · & .game-row>.button
  "[@media_(max-width:800px)]:[&_.game-row>.button]:[margin-left:auto]",
  // (max-width:800px) · & .top-avatar
  "[@media_(max-width:800px)]:[&_.top-avatar]:hidden",
  // (max-width:800px) · & h1
  "[@media_(max-width:800px)]:[&_h1]:[font-size:27px]",
  // (max-width:800px) · & .eyebrow
  "[@media_(max-width:800px)]:[&_.eyebrow]:[font-size:9px]",
  // (max-width:800px) · & .page-heading .button
  "[@media_(max-width:800px)]:[&_.page-heading_.button]:[font-size:12px]",
  // (max-width:800px) · & .bar-chart
  "[@media_(max-width:800px)]:[&_.bar-chart]:[height:200px]",
  // (max-width:800px) · & .panel-heading
  "[@media_(max-width:800px)]:[&_.panel-heading]:[flex-wrap:wrap] [@media_(max-width:800px)]:[&_.panel-heading]:[padding:18px]",
  // (max-width:800px) · & .chart-legend
  "[@media_(max-width:800px)]:[&_.chart-legend]:[font-size:12px]",
  // (max-width:800px) · & footer
  "[@media_(max-width:800px)]:[&_footer]:[line-height:2] [@media_(max-width:800px)]:[&_footer]:block",
  // (max-width:800px) · & footer span
  "[@media_(max-width:800px)]:[&_footer_span]:block",
  // base · & .heading-actions
  "[&_.heading-actions]:items-center [&_.heading-actions]:[gap:10px] [&_.heading-actions]:flex",
  // base · & input:not([type=range])
  "[&_input:not([type=range])]:[min-width:0] [&_input:not([type=range])]:[color:var(--ink)] [&_input:not([type=range])]:[background:#fff] [&_input:not([type=range])]:[border:1px_solid_#dfe4db] [&_input:not([type=range])]:[border-radius:7px] [&_input:not([type=range])]:[padding:11px_12px] [&_input:not([type=range])]:[font-size:16px]",
  // base · & input:disabled
  "[&_input:disabled]:[color:#969e8c] [&_input:disabled]:[background:#f3f4f0]",
  // base · & label
  "[&_label]:[font-size:14px] [&_label]:font-medium",
  // base · & label>input
  "[&_label>input]:w-full [&_label>input]:[margin-top:8px] [&_label>input]:block",
  // base · & label>select
  "[&_label>select]:w-full [&_label>select]:[margin-top:8px] [&_label>select]:block",
  // base · & .icon-button
  "[&_.icon-button]:[color:#859178] [&_.icon-button]:[background:0_0] [&_.icon-button]:[border:0] [&_.icon-button]:[border-radius:6px] [&_.icon-button]:justify-center [&_.icon-button]:items-center [&_.icon-button]:[padding:8px] [&_.icon-button]:inline-flex",
  // base · & .icon-button:hover
  "[&_.icon-button:hover]:[background:#eff2e9]",
  // base · & .info-strip
  "[&_.info-strip]:[color:#5f714b] [&_.info-strip]:[background:#f1f5e9] [&_.info-strip]:[border:1px_solid_#e4e9dc] [&_.info-strip]:[border-radius:10px] [&_.info-strip]:[gap:14px] [&_.info-strip]:[margin-bottom:23px] [&_.info-strip]:[padding:20px_23px] [&_.info-strip]:flex",
  // base · & .info-strip>svg
  "[&_.info-strip>svg]:[flex-shrink:0] [&_.info-strip>svg]:[margin-top:2px]",
  // base · & .info-strip b
  "[&_.info-strip_b]:[font-size:14px]",
  // base · & .info-strip p
  "[&_.info-strip_p]:[color:#88967b] [&_.info-strip_p]:[margin-top:6px] [&_.info-strip_p]:[font-size:14px] [&_.info-strip_p]:[line-height:1.7]",
  // base · & .section-summary
  "[&_.section-summary]:[color:#89947e] [&_.section-summary]:justify-between [&_.section-summary]:[margin:5px_0_20px] [&_.section-summary]:[font-size:14px] [&_.section-summary]:flex",
  // base · & .section-summary b
  "[&_.section-summary_b]:[color:#3e4f2d]",
  // base · & .game-cards
  "[&_.game-cards]:[grid-template-columns:repeat(3,minmax(0,1fr))] [&_.game-cards]:[gap:20px] [&_.game-cards]:grid",
  // base · & .game-card
  "[&_.game-card]:[margin:0_0_20px]",
  // base · & .game-card-top
  "[&_.game-card-top]:[background:#f5f2fc] [&_.game-card-top]:[border-bottom:1px_solid_#eee9f7] [&_.game-card-top]:justify-between [&_.game-card-top]:items-start [&_.game-card-top]:[height:145px] [&_.game-card-top]:[padding:22px] [&_.game-card-top]:flex [&_.game-card-top]:relative",
  // base · & .game-card-top.orange
  "[&_.game-card-top.orange]:[background:#fbf4e9] [&_.game-card-top.orange]:[border-bottom-color:#f2e9d9]",
  // base · & .game-card-top .game-icon
  "[&_.game-card-top_.game-icon]:[background:#fff] [&_.game-card-top_.game-icon]:[width:62px] [&_.game-card-top_.game-icon]:[height:62px] [&_.game-card-top_.game-icon]:[box-shadow:0_4px_12px_#00000005]",
  // base · & .game-engine
  "[&_.game-engine]:[letter-spacing:1.1px] [&_.game-engine]:[color:#a598b8] [&_.game-engine]:[font-size:12px] [&_.game-engine]:absolute [&_.game-engine]:[bottom:17px] [&_.game-engine]:[left:22px]",
  // base · & .game-card-body
  "[&_.game-card-body]:[padding:22px]",
  // base · & .game-card-body h2
  "[&_.game-card-body_h2]:[letter-spacing:-.6px] [&_.game-card-body_h2]:[font-size:20px]",
  // base · & .game-card-body>p
  "[&_.game-card-body>p]:[color:#8b9581] [&_.game-card-body>p]:[min-height:44px] [&_.game-card-body>p]:[margin:10px_0_21px] [&_.game-card-body>p]:[font-size:14px] [&_.game-card-body>p]:[line-height:1.6]",
  // base · & .card-stats
  "[&_.card-stats]:[border-top:1px_solid_var(--line)] [&_.card-stats]:[grid-template-columns:1fr_1fr] [&_.card-stats]:[gap:17px] [&_.card-stats]:[padding:19px_0] [&_.card-stats]:grid",
  // base · & .card-stats div:last-child
  "[&_.card-stats_div:last-child]:[grid-column:1/-1]",
  // base · & .card-stats small
  "[&_.card-stats_small]:[color:#919c85] [&_.card-stats_small]:[margin-bottom:7px] [&_.card-stats_small]:[font-size:12px] [&_.card-stats_small]:block",
  // base · & .card-stats b
  "[&_.card-stats_b]:[font-size:16px] [&_.card-stats_b]:[font-weight:550]",
  // base · & .game-card-actions
  "[&_.game-card-actions]:[flex-wrap:wrap] [&_.game-card-actions]:items-center [&_.game-card-actions]:[gap:8px] [&_.game-card-actions]:[padding-top:5px] [&_.game-card-actions]:flex",
  // base · & .game-card-actions .button
  "[&_.game-card-actions_.button]:whitespace-nowrap [&_.game-card-actions_.button]:[flex:1]",
  // base · & .connection-note
  "[&_.connection-note]:[color:#a29378] [&_.connection-note]:[align-items:start] [&_.connection-note]:[gap:10px] [&_.connection-note]:[min-height:125px] [&_.connection-note]:[padding:15px_0] [&_.connection-note]:[font-size:14px] [&_.connection-note]:[line-height:1.7] [&_.connection-note]:flex",
  // base · & .connection-note svg
  "[&_.connection-note_svg]:[flex-shrink:0]",
  // base · & .add-game-card
  "[&_.add-game-card]:[color:#8a9b77] [&_.add-game-card]:[background:#f7f9f2] [&_.add-game-card]:[border:1px_dashed_#ced7c0] [&_.add-game-card]:[border-radius:13px] [&_.add-game-card]:flex-col [&_.add-game-card]:justify-center [&_.add-game-card]:items-center [&_.add-game-card]:[gap:16px] [&_.add-game-card]:[min-height:250px] [&_.add-game-card]:[margin-bottom:20px] [&_.add-game-card]:[padding:28px] [&_.add-game-card]:flex",
  // base · & .add-game-card>span
  "[&_.add-game-card>span]:[background:#eaf1df] [&_.add-game-card>span]:[border:1px_solid_#dde8cd] [&_.add-game-card>span]:rounded-full [&_.add-game-card>span]:[place-items:center] [&_.add-game-card>span]:[width:53px] [&_.add-game-card>span]:[height:53px] [&_.add-game-card>span]:grid",
  // base · & .add-game-card b
  "[&_.add-game-card_b]:[color:#596e43] [&_.add-game-card_b]:[font-size:16px]",
  // base · & .add-game-card small
  "[&_.add-game-card_small]:[max-width:240px] [&_.add-game-card_small]:[font-size:14px] [&_.add-game-card_small]:[line-height:1.7]",
  // base · & .log-totals
  "[&_.log-totals]:[color:#8f9b82] [&_.log-totals]:[flex-wrap:wrap] [&_.log-totals]:[gap:22px] [&_.log-totals]:[margin-bottom:24px] [&_.log-totals]:[font-size:14px] [&_.log-totals]:flex",
  // base · & .log-totals b
  "[&_.log-totals_b]:[color:#50623b] [&_.log-totals_b]:font-semibold",
  // base · & .filter-bar
  "[&_.filter-bar]:[border-bottom:1px_solid_var(--line)] [&_.filter-bar]:[flex-wrap:wrap] [&_.filter-bar]:[gap:12px] [&_.filter-bar]:[padding:20px] [&_.filter-bar]:flex",
  // base · & .search-box
  "[&_.search-box]:[border:1px_solid_var(--line)] [&_.search-box]:[color:#9aa88a] [&_.search-box]:[border-radius:7px] [&_.search-box]:[flex:1] [&_.search-box]:items-center [&_.search-box]:[gap:8px] [&_.search-box]:[min-width:190px] [&_.search-box]:[padding-left:12px] [&_.search-box]:flex",
  // base · & .search-box input
  "[&_.search-box_input]:[background:0_0] [&_.search-box_input]:[border:0] [&_.search-box_input]:[flex:1] [&_.search-box_input]:m-0 [&_.search-box_input]:[font-size:14px]",
  // base · & .pagination
  "[&_.pagination]:[border-top:1px_solid_var(--line)] [&_.pagination]:[color:#99a58b] [&_.pagination]:justify-between [&_.pagination]:items-center [&_.pagination]:[gap:15px] [&_.pagination]:[padding:17px_24px] [&_.pagination]:[font-size:12px] [&_.pagination]:flex",
  // base · & .pagination>div
  "[&_.pagination>div]:[gap:8px] [&_.pagination>div]:flex",
  // base · & .fine-print
  "[&_.fine-print]:[color:#96a18b] [&_.fine-print]:[margin-bottom:23px] [&_.fine-print]:[font-size:12px] [&_.fine-print]:[line-height:1.7]",
  // base · & .empty-state
  "[&_.empty-state]:text-center [&_.empty-state]:[color:#9da68f] [&_.empty-state]:[padding:45px_24px]",
  // base · & .empty-state h3
  "[&_.empty-state_h3]:[color:#6c7a58] [&_.empty-state_h3]:[margin:14px_0_8px] [&_.empty-state_h3]:[font-size:17px]",
  // base · & .empty-state p
  "[&_.empty-state_p]:[font-size:14px] [&_.empty-state_p]:[line-height:1.6]",
  // base · & .probability-row
  "[&_.probability-row]:[border-top:1px_solid_var(--line)] [&_.probability-row]:items-center [&_.probability-row]:[gap:18px] [&_.probability-row]:[padding:25px_24px] [&_.probability-row]:flex",
  // base · & .probability-name
  "[&_.probability-name]:[min-width:170px]",
  // base · & .probability-name b
  "[&_.probability-name_b]:[font-size:15px]",
  // base · & .probability-name small
  "[&_.probability-name_small]:[color:#95a187] [&_.probability-name_small]:[margin-top:7px] [&_.probability-name_small]:[font-size:12px] [&_.probability-name_small]:block",
  // base · & .odds-meter
  "[&_.odds-meter]:[flex:1] [&_.odds-meter]:[min-width:120px]",
  // base · & .odds-meter>div:first-child
  "[&_.odds-meter>div:first-child]:items-center [&_.odds-meter>div:first-child]:[gap:8px] [&_.odds-meter>div:first-child]:flex",
  // base · & .odds-meter b
  "[&_.odds-meter_b]:[font-size:20px]",
  // base · & .odds-meter span
  "[&_.odds-meter_span]:[color:#95a087] [&_.odds-meter_span]:[font-size:12px]",
  // base · & .odds-meter .probability-track
  "[&_.odds-meter_.probability-track]:[margin:9px_0_0]",
  // base · & .probability-row .game-stat
  "[&_.probability-row_.game-stat]:[min-width:70px] [&_.probability-row_.game-stat]:[margin:0_12px]",
  // base · & .probability-row .game-stat small
  "[&_.probability-row_.game-stat_small]:[font-size:12px]",
  // base · & .probability-row .game-stat b
  "[&_.probability-row_.game-stat_b]:[font-size:16px]",
  // base · & .muted
  "[&_.muted]:[color:#949e89] [&_.muted]:[font-size:14px]",
  // base · & .status.not_connected
  "[&_.status.not\\_connected]:[color:#a68a59] [&_.status.not\\_connected]:[background:#f5eddf]",
  // base · & .status.settled
  "[&_.status.settled]:[color:#8a9a76] [&_.status.settled]:[background:#f2f5ee]",
  // base · & .status.needs_review
  "[&_.status.needs\\_review]:[color:#a73] [&_.status.needs\\_review]:[background:#fff0d9]",
  // base · & .status.debit_pending
  "[&_.status.debit\\_pending]:[color:#a73] [&_.status.debit\\_pending]:[background:#fff0d9]",
  // base · & .status.credit_pending
  "[&_.status.credit\\_pending]:[color:#a73] [&_.status.credit\\_pending]:[background:#fff0d9]",
  // base · & .integration-row
  "[&_.integration-row]:[border-top:1px_solid_var(--line)] [&_.integration-row]:items-center [&_.integration-row]:[gap:18px] [&_.integration-row]:[padding:23px_24px] [&_.integration-row]:flex",
  // base · & .integration-symbol
  "[&_.integration-symbol]:[color:#8da079] [&_.integration-symbol]:[background:#f3f6ed] [&_.integration-symbol]:[border-radius:10px] [&_.integration-symbol]:[flex-shrink:0] [&_.integration-symbol]:[place-items:center] [&_.integration-symbol]:[width:43px] [&_.integration-symbol]:[height:43px] [&_.integration-symbol]:grid",
  // base · & .integration-row>div
  "[&_.integration-row>div]:[flex:1]",
  // base · & .integration-row b
  "[&_.integration-row_b]:[font-size:15px]",
  // base · & .integration-row p
  "[&_.integration-row_p]:[color:#98a18d] [&_.integration-row_p]:[margin-top:6px] [&_.integration-row_p]:[font-size:14px] [&_.integration-row_p]:[line-height:1.6]",
  // base · & .setup-panel
  "[&_.setup-panel]:[padding:26px]",
  // base · & .setup-panel h2
  "[&_.setup-panel_h2]:[font-size:18px]",
  // base · & .setup-panel>p
  "[&_.setup-panel>p]:[color:#98a18d] [&_.setup-panel>p]:[margin:10px_0_20px] [&_.setup-panel>p]:[font-size:14px] [&_.setup-panel>p]:[line-height:1.7]",
  // base · & .url-box
  "[&_.url-box]:[background:#f5f7f0] [&_.url-box]:[border:1px_solid_#e6ebdc] [&_.url-box]:[border-radius:8px] [&_.url-box]:justify-between [&_.url-box]:items-center [&_.url-box]:[gap:12px] [&_.url-box]:[margin:15px_0] [&_.url-box]:[padding:13px_14px] [&_.url-box]:flex",
  // base · & .url-box code
  "[&_.url-box_code]:[overflow-wrap:anywhere] [&_.url-box_code]:[word-break:break-word] [&_.url-box_code]:[color:#819264] [&_.url-box_code]:[font-size:13px]",
  // base · & .warning
  "[&_.warning]:[color:#aa945e] [&_.warning]:[background:#fff8e9] [&_.warning]:[border-color:#f0e3c4]",
  // base · & .integration-steps
  "[&_.integration-steps]:[grid-template-columns:1fr_1fr] [&_.integration-steps]:[gap:28px] [&_.integration-steps]:[margin:26px_0_0] [&_.integration-steps]:p-0 [&_.integration-steps]:[list-style:none] [&_.integration-steps]:grid",
  // base · & .integration-steps li
  "[&_.integration-steps_li]:[gap:14px] [&_.integration-steps_li]:flex",
  // base · & .integration-steps li>span
  "[&_.integration-steps_li>span]:[color:#b6c2a4] [&_.integration-steps_li>span]:[letter-spacing:-1px] [&_.integration-steps_li>span]:[font-family:Manrope,sans-serif] [&_.integration-steps_li>span]:[font-size:23px]",
  // base · & .integration-steps b
  "[&_.integration-steps_b]:[color:#71815d] [&_.integration-steps_b]:[font-size:14px]",
  // base · & .integration-steps p
  "[&_.integration-steps_p]:[color:#9ba78e] [&_.integration-steps_p]:[margin-top:7px] [&_.integration-steps_p]:[font-size:14px] [&_.integration-steps_p]:[line-height:1.7]",
  // base · & .modal
  "[&_.modal]:[width:min(590px,100vw_-_28px)] [&_.modal]:[max-height:92vh] [&_.modal]:[color:var(--ink)] [&_.modal]:[border:1px_solid_#e1e6d9] [&_.modal]:[border-radius:16px] [&_.modal]:p-0 [&_.modal]:[box-shadow:0_20px_90px_#202c1633]",
  // base · & .modal.wide
  "[&_.modal.wide]:[width:min(710px,100vw_-_28px)]",
  // base · & .modal::backdrop
  "[&_.modal::backdrop]:[backdrop-filter:blur(3px)] [&_.modal::backdrop]:[background:#222d2070]",
  // base · & .modal-heading
  "[&_.modal-heading]:[border-bottom:1px_solid_var(--line)] [&_.modal-heading]:justify-between [&_.modal-heading]:items-center [&_.modal-heading]:[padding:21px_25px] [&_.modal-heading]:flex",
  // base · & .modal-heading h2
  "[&_.modal-heading_h2]:[font-size:20px]",
  // base · & .modal-body
  "[&_.modal-body]:[padding:24px]",
  // base · & .form-grid
  "[&_.form-grid]:[grid-template-columns:1fr_1fr] [&_.form-grid]:[gap:20px] [&_.form-grid]:[margin-bottom:20px] [&_.form-grid]:grid",
  // base · & .form-grid label
  "[&_.form-grid_label]:[color:#78876a] [&_.form-grid_label]:[font-size:14px]",
  // base · & .odds-setting
  "[&_.odds-setting]:[background:#f4f7ed] [&_.odds-setting]:[border:1px_solid_#e6edd9] [&_.odds-setting]:[border-radius:10px] [&_.odds-setting]:[margin:22px_0] [&_.odds-setting]:[padding:20px]",
  // base · & .odds-setting label
  "[&_.odds-setting_label]:justify-between [&_.odds-setting_label]:[font-size:14px] [&_.odds-setting_label]:flex",
  // base · & .odds-setting label b
  "[&_.odds-setting_label_b]:[color:#607a41] [&_.odds-setting_label_b]:[font-size:19px]",
  // base · & input[type=range]
  "[&_input[type=range]]:[accent-color:#8bb552] [&_input[type=range]]:cursor-pointer [&_input[type=range]]:w-full [&_input[type=range]]:[margin:19px_0_7px]",
  // base · & .odds-setting .split-label
  "[&_.odds-setting_.split-label]:m-0 [&_.odds-setting_.split-label]:[font-size:12px]",
  // base · & .odds-setting p
  "[&_.odds-setting_p]:[color:#8e9c7b] [&_.odds-setting_p]:[margin-top:17px] [&_.odds-setting_p]:[font-size:12px] [&_.odds-setting_p]:[line-height:1.7]",
  // base · & .return-preview
  "[&_.return-preview]:[color:#838494] [&_.return-preview]:[background:#f7f7f9] [&_.return-preview]:[border:1px_solid_#ebebf0] [&_.return-preview]:[border-radius:9px] [&_.return-preview]:[flex-wrap:wrap] [&_.return-preview]:justify-between [&_.return-preview]:items-center [&_.return-preview]:[gap:12px] [&_.return-preview]:[padding:17px] [&_.return-preview]:[font-size:14px] [&_.return-preview]:flex",
  // base · & .return-preview strong
  "[&_.return-preview_strong]:[color:#767187] [&_.return-preview_strong]:[font-size:23px]",
  // base · & .return-preview small
  "[&_.return-preview_small]:w-full [&_.return-preview_small]:[font-size:12px] [&_.return-preview_small]:[line-height:1.6]",
  // base · & .modal-footer
  "[&_.modal-footer]:[border-top:1px_solid_var(--line)] [&_.modal-footer]:[background:#fff] [&_.modal-footer]:justify-end [&_.modal-footer]:[gap:10px] [&_.modal-footer]:[padding:17px_24px] [&_.modal-footer]:flex [&_.modal-footer]:sticky [&_.modal-footer]:[bottom:0]",
  // base · & .error-message
  "[&_.error-message]:[color:#ab5f52] [&_.error-message]:[background:#fff1ed] [&_.error-message]:[border:1px_solid_#f6dcd3] [&_.error-message]:[border-radius:7px] [&_.error-message]:[margin:15px_0] [&_.error-message]:[padding:13px_16px] [&_.error-message]:[font-size:14px] [&_.error-message]:[line-height:1.7]",
  // base · & .error-message button
  "[&_.error-message_button]:[margin-left:12px]",
  // base · & .toast
  "[&_.toast]:[color:#fff] [&_.toast]:[z-index:100] [&_.toast]:[background:#293421] [&_.toast]:[border-radius:10px] [&_.toast]:items-center [&_.toast]:[gap:12px] [&_.toast]:[max-width:calc(100vw_-_30px)] [&_.toast]:[padding:15px_22px] [&_.toast]:[font-size:14px] [&_.toast]:flex [&_.toast]:fixed [&_.toast]:[bottom:28px] [&_.toast]:[left:50%] [&_.toast]:[transform:translate(-50%)] [&_.toast]:[box-shadow:0_5px_30px_#0002]",
  // base · & .toast svg
  "[&_.toast_svg]:[color:var(--lime)] [&_.toast_svg]:[flex-shrink:0]",
  // base · & .detail-title
  "[&_.detail-title]:justify-between [&_.detail-title]:[align-items:start] [&_.detail-title]:[gap:15px] [&_.detail-title]:[margin-bottom:22px] [&_.detail-title]:flex",
  // base · & .detail-title h3
  "[&_.detail-title_h3]:[font-size:21px]",
  // base · & .mono
  "[&_.mono]:[color:#9aa78c] [&_.mono]:[overflow-wrap:anywhere] [&_.mono]:[margin-top:9px] [&_.mono]:[font-family:monospace] [&_.mono]:[font-size:12px]",
  // base · & .detail-grid
  "[&_.detail-grid]:[grid-template-columns:1fr_1fr] [&_.detail-grid]:[gap:23px] [&_.detail-grid]:[margin-bottom:27px] [&_.detail-grid]:grid",
  // base · & .detail-grid small
  "[&_.detail-grid_small]:[color:#8f9e7f] [&_.detail-grid_small]:[margin-bottom:7px] [&_.detail-grid_small]:[font-size:12px] [&_.detail-grid_small]:block",
  // base · & .detail-grid b
  "[&_.detail-grid_b]:[overflow-wrap:anywhere] [&_.detail-grid_b]:[font-size:14px] [&_.detail-grid_b]:font-medium",
  // base · & details
  "[&_details]:[color:#8a9979] [&_details]:[margin:16px_0] [&_details]:[font-size:14px]",
  // base · & pre
  "[&_pre]:[background:#f7f9f3] [&_pre]:[border-radius:8px] [&_pre]:[padding:15px] [&_pre]:[font-size:12px] [&_pre]:[line-height:1.7] [&_pre]:overflow-auto",
  // base · & .chart-footnote
  "[&_.chart-footnote]:[color:#a0aa93] [&_.chart-footnote]:[margin:0_25px_20px] [&_.chart-footnote]:[font-size:12px]",
  // base · & .loading-message
  "[&_.loading-message]:[color:#8a9b76] [&_.loading-message]:[margin-bottom:20px] [&_.loading-message]:[font-size:14px]",
  // base · & .login-page
  "[&_.login-page]:[background:#f0f3e9] [&_.login-page]:[place-items:center] [&_.login-page]:[min-height:100vh] [&_.login-page]:[padding:24px] [&_.login-page]:grid",
  // base · & .login-card
  "[&_.login-card]:[background:#fff] [&_.login-card]:[border:1px_solid_#e4e9db] [&_.login-card]:[border-radius:18px] [&_.login-card]:w-full [&_.login-card]:[max-width:430px] [&_.login-card]:[padding:37px]",
  // base · & .login-card .brand
  "[&_.login-card_.brand]:[margin-bottom:33px] [&_.login-card_.brand]:p-0",
  // base · & .login-icon
  "[&_.login-icon]:[color:#98af77] [&_.login-icon]:[margin-bottom:19px]",
  // base · & .login-card h1
  "[&_.login-card_h1]:[font-size:26px]",
  // base · & .login-card>p
  "[&_.login-card>p]:[color:#8c9b7a] [&_.login-card>p]:[margin:10px_0_25px] [&_.login-card>p]:[font-size:14px] [&_.login-card>p]:[line-height:1.8]",
  // base · & .login-card .button
  "[&_.login-card_.button]:w-full [&_.login-card_.button]:[margin-top:24px]",
  // base · & .login-card>small
  "[&_.login-card>small]:[color:#a0ab92] [&_.login-card>small]:[margin-top:25px] [&_.login-card>small]:[font-size:12px] [&_.login-card>small]:[line-height:1.6] [&_.login-card>small]:block",
  // base · & .login-card input
  "[&_.login-card_input]:[margin-top:12px]",
  // base · & .login-card label
  "[&_.login-card_label]:[color:#758565]",
  // base · & .app-shell>main
  "[&_.app-shell>main]:[width:calc(100%_-_256px)] [&_.app-shell>main]:[margin-left:256px]",
  // base · & .game-cards .game-icon
  "[&_.game-cards_.game-icon]:[color:#9172b9]",
  // base · & .game-cards .orange .game-icon
  "[&_.game-cards_.orange_.game-icon]:[color:#c09b5c]",
  // base · & .metric>div svg
  "[&_.metric>div_svg]:[flex-shrink:0]",
  // base · & .notice b
  "[&_.notice_b]:font-semibold",
  // base · & .health-panel .panel-heading
  "[&_.health-panel_.panel-heading]:[padding-bottom:16px]",
  // base · & .chart-panel .panel-heading
  "[&_.chart-panel_.panel-heading]:[flex-wrap:wrap]",
  // base · & .player-page
  "[&_.player-page]:[color:#f1f5eb] [&_.player-page]:[background:#171d19] [&_.player-page]:[min-height:100vh] [&_.player-page]:[padding:24px_20px_60px]",
  // base · & .player-top
  "[&_.player-top]:justify-between [&_.player-top]:items-center [&_.player-top]:[gap:20px] [&_.player-top]:[max-width:1000px] [&_.player-top]:[margin:0_auto_35px] [&_.player-top]:flex",
  // base · & .player-brand
  "[&_.player-brand]:[letter-spacing:-.5px] [&_.player-brand]:items-center [&_.player-brand]:[gap:12px] [&_.player-brand]:[font-weight:650] [&_.player-brand]:flex",
  // base · & .player-brand .brand-mark
  "[&_.player-brand_.brand-mark]:[color:#293821]",
  // base · & .player-brand small
  "[&_.player-brand_small]:[letter-spacing:2px] [&_.player-brand_small]:[color:#929c8c] [&_.player-brand_small]:[margin-top:2px] [&_.player-brand_small]:[font-size:10px] [&_.player-brand_small]:font-normal [&_.player-brand_small]:block",
  // base · & .player-back
  "[&_.player-back]:[color:#99aa91] [&_.player-back]:items-center [&_.player-back]:[gap:7px] [&_.player-back]:[font-size:13px] [&_.player-back]:flex",
  // base · & .player-shell
  "[&_.player-shell]:[background:#20291f] [&_.player-shell]:[border:1px_solid_#36402f] [&_.player-shell]:[border-radius:20px] [&_.player-shell]:[max-width:470px] [&_.player-shell]:[margin:auto] [&_.player-shell]:[padding:25px] [&_.player-shell]:overflow-hidden [&_.player-shell]:[box-shadow:0_30px_80px_#0003]",
  // base · & .player-mode
  "[&_.player-mode]:[color:#a6b297] [&_.player-mode]:[border-bottom:1px_solid_#35412c] [&_.player-mode]:justify-between [&_.player-mode]:items-center [&_.player-mode]:[gap:12px] [&_.player-mode]:[padding-bottom:20px] [&_.player-mode]:[font-size:11px] [&_.player-mode]:flex",
  // base · & .player-mode>span:first-child
  "[&_.player-mode>span:first-child]:[color:#c4e995] [&_.player-mode>span:first-child]:[letter-spacing:1px] [&_.player-mode>span:first-child]:items-center [&_.player-mode>span:first-child]:[gap:6px] [&_.player-mode>span:first-child]:flex",
  // base · & .player-title
  "[&_.player-title]:justify-between [&_.player-title]:items-center [&_.player-title]:[padding:24px_0_22px] [&_.player-title]:flex",
  // base · & .player-title h1
  "[&_.player-title_h1]:[color:#edf6e5] [&_.player-title_h1]:[font-size:29px]",
  // base · & .player-title .eyebrow
  "[&_.player-title_.eyebrow]:[color:#82956f] [&_.player-title_.eyebrow]:[margin-bottom:8px] [&_.player-title_.eyebrow]:[font-size:10px]",
  // base · & .player-title .game-icon
  "[&_.player-title_.game-icon]:[color:#bbd49b] [&_.player-title_.game-icon]:[background:#36412e]",
  // base · & .player-wallet
  "[&_.player-wallet]:[background:#293424] [&_.player-wallet]:[border:1px_solid_#3b482e] [&_.player-wallet]:[border-radius:10px] [&_.player-wallet]:justify-between [&_.player-wallet]:items-center [&_.player-wallet]:[gap:10px] [&_.player-wallet]:[padding:14px] [&_.player-wallet]:flex",
  // base · & .player-wallet>div:first-child
  "[&_.player-wallet>div:first-child]:items-center [&_.player-wallet>div:first-child]:[gap:10px] [&_.player-wallet>div:first-child]:flex",
  // base · & .player-avatar
  "[&_.player-avatar]:[color:#cde5ae] [&_.player-avatar]:[background:#465938] [&_.player-avatar]:rounded-full [&_.player-avatar]:[place-items:center] [&_.player-avatar]:[width:34px] [&_.player-avatar]:[height:34px] [&_.player-avatar]:[font-size:14px] [&_.player-avatar]:grid",
  // base · & .player-wallet b
  "[&_.player-wallet_b]:[font-size:13px] [&_.player-wallet_b]:font-medium",
  // base · & .player-wallet small
  "[&_.player-wallet_small]:[color:#9dad8d] [&_.player-wallet_small]:[margin-top:4px] [&_.player-wallet_small]:[font-size:11px] [&_.player-wallet_small]:block",
  // base · & .player-wallet>div:last-child
  "[&_.player-wallet>div:last-child]:text-right",
  // base · & .player-wallet strong
  "[&_.player-wallet_strong]:[color:#d6efb9] [&_.player-wallet_strong]:[font-size:21px]",
  // base · & .flip-stage
  "[&_.flip-stage]:text-center [&_.flip-stage]:[padding:30px_0_22px]",
  // base · & .flip-token
  "[&_.flip-token]:[color:#d4efaa] [&_.flip-token]:[background:#455c2c] [&_.flip-token]:[border:3px_solid_#b5d978] [&_.flip-token]:rounded-full [&_.flip-token]:flex-col [&_.flip-token]:justify-center [&_.flip-token]:items-center [&_.flip-token]:[gap:4px] [&_.flip-token]:[width:118px] [&_.flip-token]:[height:118px] [&_.flip-token]:[margin:auto] [&_.flip-token]:[transition:transform_.6s] [&_.flip-token]:flex [&_.flip-token]:[box-shadow:0_0_0_7px_#2c3c23,0_12px_25px_#0002]",
  // base · & .flip-token>span
  "[&_.flip-token>span]:[letter-spacing:2px] [&_.flip-token>span]:[font-size:11px]",
  // base · & .flip-token.winner
  "[&_.flip-token.winner]:[background:#60823c] [&_.flip-token.winner]:[box-shadow:0_0_0_7px_#3b512b,0_0_55px_#9fc76330]",
  // base · & .flip-token.flipping
  "[&_.flip-token.flipping]:[animation:.32s_linear_infinite_portal-flip]",
  // base · & .result-message
  "[&_.result-message]:[min-height:45px] [&_.result-message]:[margin:25px_0_0]",
  // base · & .result-message b
  "[&_.result-message_b]:[font-size:17px] [&_.result-message_b]:[font-weight:550] [&_.result-message_b]:block",
  // base · & .result-message span
  "[&_.result-message_span]:[color:#93a485] [&_.result-message_span]:[margin-top:7px] [&_.result-message_span]:[font-size:12px] [&_.result-message_span]:block",
  // base · & .won-text
  "[&_.won-text]:[color:#c5ed91]!",
  // base · & .choice-label
  "[&_.choice-label]:[letter-spacing:1.2px] [&_.choice-label]:[color:#8ba079] [&_.choice-label]:[margin-bottom:12px] [&_.choice-label]:[font-size:11px]",
  // base · & .side-choices
  "[&_.side-choices]:[grid-template-columns:1fr_1fr] [&_.side-choices]:[gap:12px] [&_.side-choices]:grid",
  // base · & .side-choices>button
  "[&_.side-choices>button]:[color:#adbda0] [&_.side-choices>button]:text-left [&_.side-choices>button]:[background:#273222] [&_.side-choices>button]:[border:1px_solid_#3e4c32] [&_.side-choices>button]:[border-radius:10px] [&_.side-choices>button]:[grid-template-columns:34px_1fr] [&_.side-choices>button]:[column-gap:9px] [&_.side-choices>button]:[padding:15px_10px] [&_.side-choices>button]:grid",
  // base · & .side-choices>button.chosen
  "[&_.side-choices>button.chosen]:[color:#e0f3c9] [&_.side-choices>button.chosen]:[background:#364a29] [&_.side-choices>button.chosen]:[border-color:#b5db7c] [&_.side-choices>button.chosen]:[box-shadow:inset_0_0_0_1px_#9dc26930]",
  // base · & .side-choices span
  "[&_.side-choices_span]:[border:1px_solid_#647a50] [&_.side-choices_span]:rounded-full [&_.side-choices_span]:[grid-row:1/3] [&_.side-choices_span]:[align-self:center] [&_.side-choices_span]:[place-items:center] [&_.side-choices_span]:[width:31px] [&_.side-choices_span]:[height:31px] [&_.side-choices_span]:[font-family:Manrope,sans-serif] [&_.side-choices_span]:grid",
  // base · & .side-choices b
  "[&_.side-choices_b]:[font-size:14px]",
  // base · & .side-choices small
  "[&_.side-choices_small]:[color:#9cb688] [&_.side-choices_small]:[margin-top:4px] [&_.side-choices_small]:[font-size:11px]",
  // base · & .bet-label
  "[&_.bet-label]:justify-between [&_.bet-label]:items-center [&_.bet-label]:[gap:10px] [&_.bet-label]:[margin:25px_0_10px] [&_.bet-label]:[font-size:13px] [&_.bet-label]:flex",
  // base · & .bet-label span
  "[&_.bet-label_span]:[color:#8c9f7d] [&_.bet-label_span]:[font-size:11px]",
  // base · & .bet-input
  "[&_.bet-input]:[color:#9bb884] [&_.bet-input]:[background:#172016] [&_.bet-input]:[border:1px_solid_#435637] [&_.bet-input]:[border-radius:8px] [&_.bet-input]:items-center [&_.bet-input]:[gap:10px] [&_.bet-input]:[padding:0_14px] [&_.bet-input]:flex",
  // base · & .bet-input input
  "[&_.bet-input_input]:[flex:1] [&_.bet-input_input]:w-full [&_.bet-input_input]:[min-width:0] [&_.bet-input_input]:[color:#e0edcf]! [&_.bet-input_input]:[background:0_0]! [&_.bet-input_input]:[border:0]! [&_.bet-input_input]:[padding:13px_0]! [&_.bet-input_input]:[font-size:21px]!",
  // base · & .bet-input span
  "[&_.bet-input_span]:[font-size:12px]",
  // base · & .quick-bets
  "[&_.quick-bets]:[gap:8px] [&_.quick-bets]:[margin:10px_0_20px] [&_.quick-bets]:flex",
  // base · & .quick-bets button
  "[&_.quick-bets_button]:[color:#a7bd94] [&_.quick-bets_button]:[background:#2c3b25] [&_.quick-bets_button]:[border:1px_solid_#3d5132] [&_.quick-bets_button]:[border-radius:6px] [&_.quick-bets_button]:[flex:1] [&_.quick-bets_button]:[padding:8px] [&_.quick-bets_button]:[font-size:12px]",
  // base · & .potential
  "[&_.potential]:[color:#93a980] [&_.potential]:justify-between [&_.potential]:[gap:12px] [&_.potential]:[padding:0_0_19px] [&_.potential]:[font-size:12px] [&_.potential]:flex",
  // base · & .potential b
  "[&_.potential_b]:[color:#b4cc9d] [&_.potential_b]:[margin-left:5px] [&_.potential_b]:font-medium",
  // base · & .potential strong
  "[&_.potential_strong]:[color:#cce4b3] [&_.potential_strong]:[font-size:14px] [&_.potential_strong]:[font-weight:550]",
  // base · & .bet-button
  "[&_.bet-button]:[color:#2c401d] [&_.bet-button]:[background:#c4ed8b] [&_.bet-button]:[border:0] [&_.bet-button]:[border-radius:9px] [&_.bet-button]:justify-center [&_.bet-button]:items-center [&_.bet-button]:[gap:12px] [&_.bet-button]:w-full [&_.bet-button]:[padding:17px] [&_.bet-button]:[font-size:16px] [&_.bet-button]:[font-weight:650] [&_.bet-button]:flex [&_.bet-button]:[box-shadow:0_3px_#6c874a]",
  // base · & .bet-button:hover
  "[&_.bet-button:hover]:[background:#d0f49c]",
  // base · & .bet-button:disabled
  "[&_.bet-button:disabled]:[opacity:.4]",
  // base · & .player-rules
  "[&_.player-rules]:text-center [&_.player-rules]:[color:#8ca27b] [&_.player-rules]:[margin-top:20px] [&_.player-rules]:[font-size:12px] [&_.player-rules]:[line-height:1.8]",
  // base · & .player-rules b
  "[&_.player-rules_b]:[color:#adc993] [&_.player-rules_b]:font-medium",
  // base · & .player-bottom
  "[&_.player-bottom]:[color:#7b946a] [&_.player-bottom]:[border-top:1px_solid_#36482b] [&_.player-bottom]:justify-center [&_.player-bottom]:items-center [&_.player-bottom]:[gap:6px] [&_.player-bottom]:[margin-top:25px] [&_.player-bottom]:[padding-top:17px] [&_.player-bottom]:[font-size:11px] [&_.player-bottom]:flex",
  // base · & .player-error
  "[&_.player-error]:[color:#dfbc93] [&_.player-error]:[background:#443a23] [&_.player-error]:[border:1px_solid_#876140] [&_.player-error]:[border-radius:7px] [&_.player-error]:[gap:8px] [&_.player-error]:[margin-bottom:18px] [&_.player-error]:[padding:13px] [&_.player-error]:[font-size:13px] [&_.player-error]:[line-height:1.7] [&_.player-error]:flex",
  // base · & .player-error svg
  "[&_.player-error_svg]:[flex-shrink:0] [&_.player-error_svg]:[margin-top:3px]",
  // base · & .player-empty
  "[&_.player-empty]:text-center [&_.player-empty]:[color:#97ad83] [&_.player-empty]:[padding:60px_10px]",
  // base · & .player-empty h2
  "[&_.player-empty_h2]:[color:#c6d9b2] [&_.player-empty_h2]:[margin:20px_0_13px] [&_.player-empty_h2]:[font-size:22px]",
  // base · & .player-empty p
  "[&_.player-empty_p]:[margin-bottom:22px] [&_.player-empty_p]:[font-size:14px] [&_.player-empty_p]:[line-height:1.8]",
  // base · & .player-history
  "[&_.player-history]:[border-top:1px_solid_#35462b] [&_.player-history]:[margin-top:25px] [&_.player-history]:[padding-top:20px]",
  // base · & .player-history h3
  "[&_.player-history_h3]:[color:#aabf97] [&_.player-history_h3]:items-center [&_.player-history_h3]:[gap:8px] [&_.player-history_h3]:[margin-bottom:15px] [&_.player-history_h3]:[font-size:14px] [&_.player-history_h3]:flex",
  // base · & .player-history>div
  "[&_.player-history>div]:[color:#91a97d] [&_.player-history>div]:[border-bottom:1px_solid_#304126] [&_.player-history>div]:justify-between [&_.player-history>div]:[padding:10px_0] [&_.player-history>div]:[font-size:12px] [&_.player-history>div]:flex",
  // base · & .spin
  "[&_.spin]:[animation:1s_linear_infinite_portal-spin]",
  // (prefers-reduced-motion:reduce) · & .flipping
  "[@media_(prefers-reduced-motion:reduce)]:[&_.flipping]:[animation:none]!",
  // (prefers-reduced-motion:reduce) · & .spin
  "[@media_(prefers-reduced-motion:reduce)]:[&_.spin]:[animation:none]!",
  // (prefers-reduced-motion:reduce) · & *
  "[@media_(prefers-reduced-motion:reduce)]:[&_*]:[scroll-behavior:auto]!",
  // (max-width:1250px) · & .game-cards
  "[@media_(max-width:1250px)]:[&_.game-cards]:[grid-template-columns:repeat(2,minmax(0,1fr))]",
  // (max-width:1250px) · & .probability-row
  "[@media_(max-width:1250px)]:[&_.probability-row]:[flex-wrap:wrap]",
  // (max-width:1250px) · & .probability-name
  "[@media_(max-width:1250px)]:[&_.probability-name]:[min-width:140px]",
  // (max-width:1250px) · & .odds-meter
  "[@media_(max-width:1250px)]:[&_.odds-meter]:[min-width:120px]",
  // (max-width:1250px) · & .metrics
  "[@media_(max-width:1250px)]:[&_.metrics]:[grid-template-columns:repeat(2,minmax(0,1fr))]",
  // (max-width:1250px) · & .overview-grid
  "[@media_(max-width:1250px)]:[&_.overview-grid]:[grid-template-columns:1.4fr_1fr]",
  // (max-width:1250px) · & .chart-legend
  "[@media_(max-width:1250px)]:[&_.chart-legend]:[font-size:12px]",
  // (max-width:1250px) · & .game-stat
  "[@media_(max-width:1250px)]:[&_.game-stat]:[min-width:70px]",
  // (max-width:1250px) · & .game-row
  "[@media_(max-width:1250px)]:[&_.game-row]:[flex-wrap:wrap]",
  // (max-width:1250px) · & .game-name
  "[@media_(max-width:1250px)]:[&_.game-name]:[flex:1]",
  // (max-width:1250px) · & .game-row .status
  "[@media_(max-width:1250px)]:[&_.game-row_.status]:[margin-left:auto]",
  // (max-width:1250px) · & .game-row .game-stat
  "[@media_(max-width:1250px)]:[&_.game-row_.game-stat]:[min-width:95px] [@media_(max-width:1250px)]:[&_.game-row_.game-stat]:[margin-left:0]",
  // (max-width:1250px) · & .game-row>.button
  "[@media_(max-width:1250px)]:[&_.game-row>.button]:[margin-left:auto]",
  // (max-width:1000px) · & .overview-grid
  "[@media_(max-width:1000px)]:[&_.overview-grid]:[grid-template-columns:1fr]",
  // (max-width:1000px) · & .heading-actions
  "[@media_(max-width:1000px)]:[&_.heading-actions]:[flex-wrap:wrap] [@media_(max-width:1000px)]:[&_.heading-actions]:justify-end",
  // (max-width:1000px) · & .page-heading
  "[@media_(max-width:1000px)]:[&_.page-heading]:[align-items:start]",
  // (max-width:1000px) · & .game-cards
  "[@media_(max-width:1000px)]:[&_.game-cards]:[grid-template-columns:1fr]",
  // (max-width:1000px) · & .integration-row
  "[@media_(max-width:1000px)]:[&_.integration-row]:[flex-wrap:wrap]",
  // (max-width:1000px) · & .integration-row .status
  "[@media_(max-width:1000px)]:[&_.integration-row_.status]:[margin-left:60px]",
  // (max-width:1000px) · & .integration-steps
  "[@media_(max-width:1000px)]:[&_.integration-steps]:[grid-template-columns:1fr]",
  // (max-width:800px) · & .app-shell>main
  "[@media_(max-width:800px)]:[&_.app-shell>main]:w-full [@media_(max-width:800px)]:[&_.app-shell>main]:m-0",
  // (max-width:800px) · & .page-heading
  "[@media_(max-width:800px)]:[&_.page-heading]:[flex-wrap:wrap] [@media_(max-width:800px)]:[&_.page-heading]:[gap:20px]",
  // (max-width:800px) · & .heading-actions
  "[@media_(max-width:800px)]:[&_.heading-actions]:[flex-wrap:wrap] [@media_(max-width:800px)]:[&_.heading-actions]:[justify-content:start] [@media_(max-width:800px)]:[&_.heading-actions]:w-full",
  // (max-width:800px) · & .top-actions
  "[@media_(max-width:800px)]:[&_.top-actions]:[gap:10px]",
  // (max-width:800px) · & .notice span
  "[@media_(max-width:800px)]:[&_.notice_span]:[flex:1]",
  // (max-width:800px) · & .game-cards
  "[@media_(max-width:800px)]:[&_.game-cards]:[grid-template-columns:repeat(2,minmax(0,1fr))]",
  // (max-width:800px) · & .game-row .status
  "[@media_(max-width:800px)]:[&_.game-row_.status]:[margin-left:0]",
  // (max-width:800px) · & .game-row .game-stat
  "[@media_(max-width:800px)]:[&_.game-row_.game-stat]:[flex:1] [@media_(max-width:800px)]:[&_.game-row_.game-stat]:[margin-left:0]",
  // (max-width:800px) · & .game-stat b
  "[@media_(max-width:800px)]:[&_.game-stat_b]:[font-size:14px]",
  // (max-width:800px) · & .probability-row
  "[@media_(max-width:800px)]:[&_.probability-row]:[gap:15px] [@media_(max-width:800px)]:[&_.probability-row]:[padding:20px]",
  // (max-width:800px) · & .probability-name
  "[@media_(max-width:800px)]:[&_.probability-name]:[flex:1]",
  // (max-width:800px) · & .odds-meter
  "[@media_(max-width:800px)]:[&_.odds-meter]:[flex-basis:100%]",
  // (max-width:800px) · & .probability-row .game-stat
  "[@media_(max-width:800px)]:[&_.probability-row_.game-stat]:[flex:1] [@media_(max-width:800px)]:[&_.probability-row_.game-stat]:m-0",
  // (max-width:800px) · & .filter-bar
  "[@media_(max-width:800px)]:[&_.filter-bar]:[padding:15px]",
  // (max-width:800px) · & .filter-bar .search-box
  "[@media_(max-width:800px)]:[&_.filter-bar_.search-box]:[flex-basis:100%]",
  // (max-width:800px) · & .filter-bar select
  "[@media_(max-width:800px)]:[&_.filter-bar_select]:[flex:1] [@media_(max-width:800px)]:[&_.filter-bar_select]:[min-width:120px]",
  // (max-width:800px) · & .game-card-actions .button
  "[@media_(max-width:800px)]:[&_.game-card-actions_.button]:[font-size:13px]",
  // (max-width:800px) · & .game-row .game-name
  "[@media_(max-width:800px)]:[&_.game-row_.game-name]:[width:auto]",
  // (max-width:550px) · & .game-cards
  "[@media_(max-width:550px)]:[&_.game-cards]:[grid-template-columns:1fr]",
  // (max-width:550px) · & .metrics
  "[@media_(max-width:550px)]:[&_.metrics]:[gap:12px]",
  // (max-width:550px) · & .metric
  "[@media_(max-width:550px)]:[&_.metric]:[padding:16px]",
  // (max-width:550px) · & .metric>div
  "[@media_(max-width:550px)]:[&_.metric>div]:[gap:4px] [@media_(max-width:550px)]:[&_.metric>div]:[font-size:13px]",
  // (max-width:550px) · & .metric strong
  "[@media_(max-width:550px)]:[&_.metric_strong]:[font-size:27px]",
  // (max-width:550px) · & .metric small
  "[@media_(max-width:550px)]:[&_.metric_small]:[font-size:12px]",
  // (max-width:550px) · & .metric>div svg
  "[@media_(max-width:550px)]:[&_.metric>div_svg]:[width:15px]",
  // (max-width:550px) · & .form-grid
  "[@media_(max-width:550px)]:[&_.form-grid]:[grid-template-columns:1fr]",
  // (max-width:550px) · & .modal-body
  "[@media_(max-width:550px)]:[&_.modal-body]:[padding:20px]",
  // (max-width:550px) · & .modal-heading
  "[@media_(max-width:550px)]:[&_.modal-heading]:[padding:18px_20px]",
  // (max-width:550px) · & .modal-heading h2
  "[@media_(max-width:550px)]:[&_.modal-heading_h2]:[font-size:18px]",
  // (max-width:550px) · & .notice button
  "[@media_(max-width:550px)]:[&_.notice_button]:w-full",
  // (max-width:550px) · & .section-summary
  "[@media_(max-width:550px)]:[&_.section-summary]:[flex-wrap:wrap] [@media_(max-width:550px)]:[&_.section-summary]:[gap:9px]",
  // (max-width:550px) · & .game-row .game-stat
  "[@media_(max-width:550px)]:[&_.game-row_.game-stat]:[min-width:90px]",
  // (max-width:550px) · & .game-row>.button
  "[@media_(max-width:550px)]:[&_.game-row>.button]:m-0",
  // (max-width:550px) · & .topbar>span
  "[@media_(max-width:550px)]:[&_.topbar>span]:[font-size:12px]",
  // (max-width:550px) · & .topbar .slash
  "[@media_(max-width:550px)]:[&_.topbar_.slash]:[padding-inline:6px]",
  // (max-width:550px) · & .top-actions .demo-pill
  "[@media_(max-width:550px)]:[&_.top-actions_.demo-pill]:[font-size:11px]",
  // (max-width:550px) · & .probability-row .button
  "[@media_(max-width:550px)]:[&_.probability-row_.button]:w-full",
  // (max-width:550px) · & .log-totals
  "[@media_(max-width:550px)]:[&_.log-totals]:[gap:12px] [@media_(max-width:550px)]:[&_.log-totals]:[font-size:13px]",
  // (max-width:550px) · & .player-page
  "[@media_(max-width:550px)]:[&_.player-page]:[padding:17px_12px_30px]",
  // (max-width:550px) · & .player-top
  "[@media_(max-width:550px)]:[&_.player-top]:[margin-bottom:18px]",
  // (max-width:550px) · & .player-shell
  "[@media_(max-width:550px)]:[&_.player-shell]:[border-radius:15px] [@media_(max-width:550px)]:[&_.player-shell]:[padding:20px]",
  // (max-width:550px) · & .player-back
  "[@media_(max-width:550px)]:[&_.player-back]:[font-size:11px]",
  // (max-width:550px) · & .player-brand
  "[@media_(max-width:550px)]:[&_.player-brand]:[font-size:14px]",
  // (max-width:550px) · & .player-top .brand-mark
  "[@media_(max-width:550px)]:[&_.player-top_.brand-mark]:[width:30px] [@media_(max-width:550px)]:[&_.player-top_.brand-mark]:[height:30px] [@media_(max-width:550px)]:[&_.player-top_.brand-mark]:[font-size:21px]",
  // (max-width:550px) · & .player-mode
  "[@media_(max-width:550px)]:[&_.player-mode]:[font-size:10px]",
  // (max-width:550px) · & .player-rules
  "[@media_(max-width:550px)]:[&_.player-rules]:[font-size:12px]",
  // (max-width:550px) · & .detail-grid
  "[@media_(max-width:550px)]:[&_.detail-grid]:[gap:20px]",
  // (max-width:550px) · & .health-number strong
  "[@media_(max-width:550px)]:[&_.health-number_strong]:[font-size:43px]",
  // (max-width:550px) · & .game-row .status
  "[@media_(max-width:550px)]:[&_.game-row_.status]:[font-size:11px]",
  // base · & .weight-heading
  "[&_.weight-heading]:justify-between [&_.weight-heading]:items-center [&_.weight-heading]:[gap:15px] [&_.weight-heading]:[margin:20px_0_17px] [&_.weight-heading]:flex",
  // base · & .weight-heading h3
  "[&_.weight-heading_h3]:[font-size:16px]",
  // base · & .odds-heading
  "[&_.odds-heading]:[margin:25px_0_15px] [&_.odds-heading]:[font-size:16px]",
  // base · & .weight-grid
  "[&_.weight-grid]:[grid-template-columns:repeat(6,1fr)] [&_.weight-grid]:[gap:8px] [&_.weight-grid]:grid",
  // base · & .weight
  "[&_.weight]:[background:#f4f5f1] [&_.weight]:[border-radius:6px] [&_.weight]:items-center [&_.weight]:[gap:6px] [&_.weight]:[padding:7px] [&_.weight]:flex",
  // base · & .weight span
  "[&_.weight_span]:[color:#fff] [&_.weight_span]:[background:#4c5345] [&_.weight_span]:[border-radius:4px] [&_.weight_span]:[place-items:center] [&_.weight_span]:[min-width:23px] [&_.weight_span]:[height:26px] [&_.weight_span]:[font-size:12px] [&_.weight_span]:grid",
  // base · & .weight.red span
  "[&_.weight.red_span]:[background:#bf7068]",
  // base · & .weight.green span
  "[&_.weight.green_span]:[background:#8bac6b]",
  // base · & .weight input
  "[&_.weight_input]:w-full [&_.weight_input]:m-0 [&_.weight_input]:[padding:6px]! [&_.weight_input]:[font-size:14px]!",
  // base · & .market-odds
  "[&_.market-odds]:[grid-template-columns:1fr_1fr] [&_.market-odds]:[gap:12px] [&_.market-odds]:[margin-bottom:22px] [&_.market-odds]:grid",
  // base · & .market-odds>div
  "[&_.market-odds>div]:[border:1px_solid_#e7ebdf] [&_.market-odds>div]:[border-radius:7px] [&_.market-odds>div]:[flex-wrap:wrap] [&_.market-odds>div]:justify-between [&_.market-odds>div]:[gap:8px] [&_.market-odds>div]:[padding:12px] [&_.market-odds>div]:[font-size:14px] [&_.market-odds>div]:flex",
  // base · & .market-odds span
  "[&_.market-odds_span]:[color:#849b6e]",
  // base · & .market-odds small
  "[&_.market-odds_small]:[color:#9aa98b] [&_.market-odds_small]:w-full [&_.market-odds_small]:[font-size:12px] [&_.market-odds_small]:block",
  // base · & .status.push
  "[&_.status.push]:[color:#828eaa] [&_.status.push]:[background:#edf0fa]",
  // base · & .outcome.push
  "[&_.outcome.push]:[color:#828eaa] [&_.outcome.push]:[background:#edf0fa]",
  // (max-width:550px) · & .weight-grid
  "[@media_(max-width:550px)]:[&_.weight-grid]:[grid-template-columns:repeat(4,1fr)]",
  // (max-width:550px) · & .market-odds
  "[@media_(max-width:550px)]:[&_.market-odds]:[grid-template-columns:1fr]",
  // base · & .roulette-shell
  "[&_.roulette-shell]:[max-width:520px]",
  // base · & .roulette-balance
  "[&_.roulette-balance]:text-right",
  // base · & .roulette-balance strong
  "[&_.roulette-balance_strong]:[color:#d2eab5] [&_.roulette-balance_strong]:[font-size:22px]",
  // base · & .roulette-balance small
  "[&_.roulette-balance_small]:[color:#90a57c] [&_.roulette-balance_small]:[margin-top:4px] [&_.roulette-balance_small]:[font-size:11px] [&_.roulette-balance_small]:block",
  // base · & .roulette-stage
  "[&_.roulette-stage]:text-center [&_.roulette-stage]:[padding:0_0_23px] [&_.roulette-stage]:relative",
  // base · & .roulette-stage img
  "[&_.roulette-stage_img]:object-contain [&_.roulette-stage_img]:[filter:drop-shadow(0_10px_16px_#0005)] [&_.roulette-stage_img]:[width:245px] [&_.roulette-stage_img]:[height:245px] [&_.roulette-stage_img]:[transition:transform_1.4s_cubic-bezier(.1,.75,.1,1)]",
  // base · & .wheel-pointer
  "[&_.wheel-pointer]:[clip-path:polygon(0_0,100%_0,50%_100%)] [&_.wheel-pointer]:[z-index:2] [&_.wheel-pointer]:[filter:drop-shadow(0_0_3px_#000)] [&_.wheel-pointer]:[background:#e6f8cd] [&_.wheel-pointer]:[width:14px] [&_.wheel-pointer]:[height:18px] [&_.wheel-pointer]:absolute [&_.wheel-pointer]:[top:-3px] [&_.wheel-pointer]:[left:calc(50%_-_7px)]",
  // base · & .roulette-result
  "[&_.roulette-result]:[color:#b7cba3] [&_.roulette-result]:justify-center [&_.roulette-result]:items-center [&_.roulette-result]:[gap:10px] [&_.roulette-result]:[min-height:38px] [&_.roulette-result]:[margin:15px_0_0] [&_.roulette-result]:[font-size:14px] [&_.roulette-result]:flex",
  // base · & .roulette-result>b
  "[&_.roulette-result>b]:[color:#eff4ea] [&_.roulette-result>b]:[background:#171e16] [&_.roulette-result>b]:[border-radius:6px] [&_.roulette-result>b]:[place-items:center] [&_.roulette-result>b]:[width:34px] [&_.roulette-result>b]:[height:34px] [&_.roulette-result>b]:grid",
  // base · & .roulette-result>b.red
  "[&_.roulette-result>b.red]:[background:#a64f43]",
  // base · & .roulette-result>b.green
  "[&_.roulette-result>b.green]:[background:#6c963f]",
  // base · & .roulette-markets
  "[&_.roulette-markets]:[grid-template-columns:repeat(4,minmax(0,1fr))] [&_.roulette-markets]:[gap:9px] [&_.roulette-markets]:grid",
  // base · & .roulette-market
  "[&_.roulette-market]:[color:#c1d7ab] [&_.roulette-market]:text-center [&_.roulette-market]:[background:#293b23] [&_.roulette-market]:[border:1px_solid_#48603a] [&_.roulette-market]:[border-radius:8px] [&_.roulette-market]:[min-height:87px] [&_.roulette-market]:[padding:13px_5px] [&_.roulette-market]:relative",
  // base · & .roulette-market.red
  "[&_.roulette-market.red]:[background:#593c2b] [&_.roulette-market.red]:[border-color:#795339]",
  // base · & .roulette-market.dark
  "[&_.roulette-market.dark]:[background:#1a261a] [&_.roulette-market.dark]:[border-color:#354c2f]",
  // base · & .roulette-market.green
  "[&_.roulette-market.green]:[background:#294326] [&_.roulette-market.green]:[border-color:#49683d]",
  // base · & .roulette-market.wagered
  "[&_.roulette-market.wagered]:[border-color:#c5ed8a] [&_.roulette-market.wagered]:[box-shadow:inset_0_0_0_1px_#b7d585]",
  // base · & .roulette-market b
  "[&_.roulette-market_b]:[font-size:16px] [&_.roulette-market_b]:block",
  // base · & .roulette-market>span
  "[&_.roulette-market>span]:[color:#a8be94] [&_.roulette-market>span]:[margin-top:5px] [&_.roulette-market>span]:[font-size:11px] [&_.roulette-market>span]:block",
  // base · & .roulette-market small
  "[&_.roulette-market_small]:[color:#8ca477] [&_.roulette-market_small]:[margin-top:5px] [&_.roulette-market_small]:[font-size:9px] [&_.roulette-market_small]:block",
  // base · & .roulette-market em
  "[&_.roulette-market_em]:[color:#394a24] [&_.roulette-market_em]:[background:#d3e994] [&_.roulette-market_em]:[border:2px_solid_#627d3f] [&_.roulette-market_em]:[border-radius:12px] [&_.roulette-market_em]:[min-width:26px] [&_.roulette-market_em]:[padding:4px] [&_.roulette-market_em]:[font-size:10px] [&_.roulette-market_em]:[font-style:normal] [&_.roulette-market_em]:absolute [&_.roulette-market_em]:[top:-7px] [&_.roulette-market_em]:[right:-4px]",
  // base · & .chip-selector
  "[&_.chip-selector]:justify-between [&_.chip-selector]:[gap:8px] [&_.chip-selector]:[padding:23px_10px_20px] [&_.chip-selector]:flex",
  // base · & .chip-selector button
  "[&_.chip-selector_button]:[color:#a7c58d] [&_.chip-selector_button]:[background:#2f4427] [&_.chip-selector_button]:[border:3px_dashed_#577244] [&_.chip-selector_button]:rounded-full [&_.chip-selector_button]:[min-width:44px] [&_.chip-selector_button]:[height:44px] [&_.chip-selector_button]:[font-size:13px] [&_.chip-selector_button]:font-semibold",
  // base · & .chip-selector button.chosen
  "[&_.chip-selector_button.chosen]:[color:#eff6d8] [&_.chip-selector_button.chosen]:[background:#719448] [&_.chip-selector_button.chosen]:[border-color:#d1eaa4] [&_.chip-selector_button.chosen]:[box-shadow:0_0_0_3px_#334b29]",
  // base · & .roulette-total
  "[&_.roulette-total]:[color:#92aa7e] [&_.roulette-total]:justify-between [&_.roulette-total]:items-center [&_.roulette-total]:[margin:0_0_20px] [&_.roulette-total]:[font-size:13px] [&_.roulette-total]:flex",
  // base · & .roulette-total b
  "[&_.roulette-total_b]:[color:#c7dfb0] [&_.roulette-total_b]:[margin-top:4px] [&_.roulette-total_b]:[font-size:19px] [&_.roulette-total_b]:block",
  // base · & .roulette-total .text-button
  "[&_.roulette-total_.text-button]:[color:#a8c48e] [&_.roulette-total_.text-button]:[font-size:12px]",
  // base · & .roulette-rules
  "[&_.roulette-rules]:[color:#9ab484] [&_.roulette-rules]:[font-size:12px] [&_.roulette-rules]:[line-height:1.8]",
  // base · & .roulette-rules p
  "[&_.roulette-rules_p]:[margin:12px_0]",
  // base · & .pocket-probabilities
  "[&_.pocket-probabilities]:[grid-template-columns:repeat(4,1fr)] [&_.pocket-probabilities]:[gap:7px] [&_.pocket-probabilities]:grid",
  // base · & .pocket-probabilities span
  "[&_.pocket-probabilities_span]:[background:#2b3c25] [&_.pocket-probabilities_span]:[border-radius:4px] [&_.pocket-probabilities_span]:justify-between [&_.pocket-probabilities_span]:[padding:5px] [&_.pocket-probabilities_span]:[font-size:10px] [&_.pocket-probabilities_span]:flex",
  // base · & .round-receipt
  "[&_.round-receipt]:[color:#9ab180] [&_.round-receipt]:[background:#2b3a24] [&_.round-receipt]:[border:1px_solid_#3e5131] [&_.round-receipt]:[border-radius:8px] [&_.round-receipt]:flex-col [&_.round-receipt]:[gap:8px] [&_.round-receipt]:[margin-top:18px] [&_.round-receipt]:[padding:15px] [&_.round-receipt]:[font-size:12px] [&_.round-receipt]:flex",
  // base · & .round-receipt b
  "[&_.round-receipt_b]:[color:#c5dbaa] [&_.round-receipt_b]:[font-size:13px] [&_.round-receipt_b]:font-medium",
  // base · & .round-receipt small
  "[&_.round-receipt_small]:[overflow-wrap:anywhere] [&_.round-receipt_small]:[font-size:10px]",
  // (max-width:420px) · & .roulette-markets
  "[@media_(max-width:420px)]:[&_.roulette-markets]:[gap:7px]",
  // (max-width:420px) · & .roulette-stage img
  "[@media_(max-width:420px)]:[&_.roulette-stage_img]:[width:215px] [@media_(max-width:420px)]:[&_.roulette-stage_img]:[height:215px]",
  // (max-width:420px) · & .roulette-market b
  "[@media_(max-width:420px)]:[&_.roulette-market_b]:[font-size:14px]",
  // (max-width:420px) · & .roulette-market small
  "[@media_(max-width:420px)]:[&_.roulette-market_small]:[font-size:10px]",
  // (max-width:420px) · & .chip-selector
  "[@media_(max-width:420px)]:[&_.chip-selector]:[padding-inline:0]",
  // (max-width:420px) · & .chip-selector button
  "[@media_(max-width:420px)]:[&_.chip-selector_button]:[min-width:42px] [@media_(max-width:420px)]:[&_.chip-selector_button]:[height:42px]",
  // (max-width:420px) · & .roulette-result
  "[@media_(max-width:420px)]:[&_.roulette-result]:[font-size:12px]",
  // (prefers-reduced-motion:reduce) · & .roulette-stage img
  "[@media_(prefers-reduced-motion:reduce)]:[&_.roulette-stage_img]:[transition:none]",
  // base · & .boot-screen
  "[&_.boot-screen]:[color:#71835d] [&_.boot-screen]:[background:#f7f8fa] [&_.boot-screen]:[place-items:center] [&_.boot-screen]:[min-height:100vh] [&_.boot-screen]:[font:16px_DM_Sans,sans-serif] [&_.boot-screen]:grid",
  // base · & .sidebar .brand
  "[&_.sidebar_.brand]:[color:#fff]",
].join(" ");
