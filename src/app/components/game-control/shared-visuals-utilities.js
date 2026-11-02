// Tailwind utility classes. Keep every candidate literal so the compiler can discover it.
export const sharedVisualsUtilities = [
  // base · & .shared-game-visuals .instant-shell
  "[&_.shared-game-visuals_.instant-shell]:[--accent:#aee5b0] [&_.shared-game-visuals_.instant-shell]:[background:linear-gradient(155deg,#243b32,#172821)] [&_.shared-game-visuals_.instant-shell]:[border-color:#496454]",
  // base · & .shared-game-visuals .instant-wheel
  "[&_.shared-game-visuals_.instant-wheel]:[--accent:#f3cf73] [&_.shared-game-visuals_.instant-wheel]:[background:linear-gradient(155deg,#3a3325,#25241d)]",
  // base · & .shared-game-visuals .instant-dragon
  "[&_.shared-game-visuals_.instant-dragon]:[--accent:#ecab91] [&_.shared-game-visuals_.instant-dragon]:[background:linear-gradient(155deg,#3d2c31,#241d29)]",
  // base · & .shared-game-visuals .instant-slots
  "[&_.shared-game-visuals_.instant-slots]:[--accent:#d3a8f0] [&_.shared-game-visuals_.instant-slots]:[background:linear-gradient(155deg,#352b48,#201c2f)]",
  // base · & .shared-game-visuals .instant-rps
  "[&_.shared-game-visuals_.instant-rps]:[--accent:#9ac9f4] [&_.shared-game-visuals_.instant-rps]:[background:linear-gradient(155deg,#263c4a,#182732)]",
  // base · & .shared-game-visuals .instant-shell .player-title h1
  "[&_.shared-game-visuals_.instant-shell_.player-title_h1]:[color:var(--accent)] [&_.shared-game-visuals_.instant-shell_.player-title_h1]:[font-size:25px]",
  // base · & .shared-game-visuals .instant-shell .player-wallet
  "[&_.shared-game-visuals_.instant-shell_.player-wallet]:[background:#0002] [&_.shared-game-visuals_.instant-shell_.player-wallet]:[border-color:#ffffff15]",
  // base · & .shared-game-visuals .instant-shell .flip-stage
  "[&_.shared-game-visuals_.instant-shell_.flip-stage]:[padding:10px_0]",
  // base · & .shared-game-visuals .single-play-choice
  "[&_.shared-game-visuals_.single-play-choice]:hidden",
  // base · & .shared-game-visuals .three-choices
  "[&_.shared-game-visuals_.three-choices]:[grid-template-columns:repeat(3,minmax(0,1fr))] [&_.shared-game-visuals_.three-choices]:[gap:7px]",
  // base · & .shared-game-visuals .three-choices>button
  "[&_.shared-game-visuals_.three-choices>button]:text-center [&_.shared-game-visuals_.three-choices>button]:flex-col [&_.shared-game-visuals_.three-choices>button]:items-center [&_.shared-game-visuals_.three-choices>button]:[gap:4px] [&_.shared-game-visuals_.three-choices>button]:[padding:8px_3px] [&_.shared-game-visuals_.three-choices>button]:flex",
  // base · & .shared-game-visuals .three-choices small
  "[&_.shared-game-visuals_.three-choices_small]:[font-size:9px]",
  // base · & .shared-game-visuals .game-theater
  "[&_.shared-game-visuals_.game-theater]:[isolation:isolate] [&_.shared-game-visuals_.game-theater]:[background:0_0] [&_.shared-game-visuals_.game-theater]:[border:0] [&_.shared-game-visuals_.game-theater]:[border-radius:16px] [&_.shared-game-visuals_.game-theater]:justify-center [&_.shared-game-visuals_.game-theater]:items-center [&_.shared-game-visuals_.game-theater]:w-full [&_.shared-game-visuals_.game-theater]:h-full [&_.shared-game-visuals_.game-theater]:[min-height:0] [&_.shared-game-visuals_.game-theater]:flex [&_.shared-game-visuals_.game-theater]:relative [&_.shared-game-visuals_.game-theater]:overflow-hidden",
  // base · & .shared-game-visuals .theater-glow
  "[&_.shared-game-visuals_.theater-glow]:[background:var(--accent)] [&_.shared-game-visuals_.theater-glow]:[opacity:.07] [&_.shared-game-visuals_.theater-glow]:[filter:blur(25px)] [&_.shared-game-visuals_.theater-glow]:[z-index:-1] [&_.shared-game-visuals_.theater-glow]:rounded-full [&_.shared-game-visuals_.theater-glow]:absolute [&_.shared-game-visuals_.theater-glow]:[inset:15%]",
  // base · & .shared-game-visuals .game-die
  "[&_.shared-game-visuals_.game-die]:[background:linear-gradient(135deg,#fffef4,#c9d8c7)] [&_.shared-game-visuals_.game-die]:[border-radius:18px] [&_.shared-game-visuals_.game-die]:[grid-template-columns:repeat(3,1fr)] [&_.shared-game-visuals_.game-die]:[gap:7px] [&_.shared-game-visuals_.game-die]:[width:85px] [&_.shared-game-visuals_.game-die]:[height:85px] [&_.shared-game-visuals_.game-die]:[margin-bottom:25px] [&_.shared-game-visuals_.game-die]:[padding:15px] [&_.shared-game-visuals_.game-die]:grid [&_.shared-game-visuals_.game-die]:[transform:rotate(-9deg)] [&_.shared-game-visuals_.game-die]:[box-shadow:5px_8px_#819b87,0_20px_30px_#0005]",
  // base · & .shared-game-visuals .pip
  "[&_.shared-game-visuals_.pip]:[background:0_0] [&_.shared-game-visuals_.pip]:rounded-full",
  // base · & .shared-game-visuals .pip.lit
  "[&_.shared-game-visuals_.pip.lit]:[background:#273b32] [&_.shared-game-visuals_.pip.lit]:[box-shadow:inset_1px_2px_2px_#0006]",
  // base · & .shared-game-visuals .rolling .game-die
  "[&_.shared-game-visuals_.rolling_.game-die]:[animation:.45s_linear_infinite_shared-visuals-dice-tumble]",
  // base · & .shared-game-visuals .revealed .game-die
  "[&_.shared-game-visuals_.revealed_.game-die]:[animation:.7s_cubic-bezier(.2,.8,.3,1)_both_shared-visuals-dice-land]",
  // base · & .shared-game-visuals .dice-orbit
  "[&_.shared-game-visuals_.dice-orbit]:[border:1px_solid_#b2e6bb33] [&_.shared-game-visuals_.dice-orbit]:rounded-full [&_.shared-game-visuals_.dice-orbit]:[width:170px] [&_.shared-game-visuals_.dice-orbit]:[height:55px] [&_.shared-game-visuals_.dice-orbit]:absolute [&_.shared-game-visuals_.dice-orbit]:[bottom:40px]",
  // base · & .shared-game-visuals .theater-caption
  "[&_.shared-game-visuals_.theater-caption]:[letter-spacing:1px] [&_.shared-game-visuals_.theater-caption]:[color:#9baea2] [&_.shared-game-visuals_.theater-caption]:[gap:25px] [&_.shared-game-visuals_.theater-caption]:[font-size:9px] [&_.shared-game-visuals_.theater-caption]:flex [&_.shared-game-visuals_.theater-caption]:absolute [&_.shared-game-visuals_.theater-caption]:[bottom:12px]",
  // base · & .shared-game-visuals .theater-caption b
  "[&_.shared-game-visuals_.theater-caption_b]:[margin-top:4px] [&_.shared-game-visuals_.theater-caption_b]:[font-size:11px] [&_.shared-game-visuals_.theater-caption_b]:block",
  // base · & .shared-game-visuals .theater-caption .selected
  "[&_.shared-game-visuals_.theater-caption_.selected]:[color:var(--accent)]",
  // base · & .shared-game-visuals .prize-wheel-wrap
  "[&_.shared-game-visuals_.prize-wheel-wrap]:[width:min(180px,85cqh)] [&_.shared-game-visuals_.prize-wheel-wrap]:[height:min(180px,85cqh)] [&_.shared-game-visuals_.prize-wheel-wrap]:relative",
  // base · & .shared-game-visuals .prize-wheel
  "[&_.shared-game-visuals_.prize-wheel]:[border:4px_solid_#caa75d] [&_.shared-game-visuals_.prize-wheel]:rounded-full [&_.shared-game-visuals_.prize-wheel]:w-full [&_.shared-game-visuals_.prize-wheel]:h-full [&_.shared-game-visuals_.prize-wheel]:[box-shadow:0_8px_20px_#0006]",
  // base · & .shared-game-visuals .prize-wheel svg
  "[&_.shared-game-visuals_.prize-wheel_svg]:w-full [&_.shared-game-visuals_.prize-wheel_svg]:h-full [&_.shared-game-visuals_.prize-wheel_svg]:block",
  // base · & .shared-game-visuals .prize-pointer
  "[&_.shared-game-visuals_.prize-pointer]:[z-index:3] [&_.shared-game-visuals_.prize-pointer]:[filter:drop-shadow(0_2px_2px_#0008)] [&_.shared-game-visuals_.prize-pointer]:[border-top:20px_solid_#fff0b4] [&_.shared-game-visuals_.prize-pointer]:[border-left:9px_solid_#0000] [&_.shared-game-visuals_.prize-pointer]:[border-right:9px_solid_#0000] [&_.shared-game-visuals_.prize-pointer]:absolute [&_.shared-game-visuals_.prize-pointer]:[top:-5px] [&_.shared-game-visuals_.prize-pointer]:[left:calc(50%_-_9px)]",
  // base · & .shared-game-visuals .wheel-hub
  "[&_.shared-game-visuals_.wheel-hub]:[color:#3e321c] [&_.shared-game-visuals_.wheel-hub]:[background:#f4d27e] [&_.shared-game-visuals_.wheel-hub]:[border:4px_solid_#b6914d] [&_.shared-game-visuals_.wheel-hub]:rounded-full [&_.shared-game-visuals_.wheel-hub]:[place-items:center] [&_.shared-game-visuals_.wheel-hub]:[width:36px] [&_.shared-game-visuals_.wheel-hub]:[height:36px] [&_.shared-game-visuals_.wheel-hub]:[font-weight:800] [&_.shared-game-visuals_.wheel-hub]:grid [&_.shared-game-visuals_.wheel-hub]:absolute [&_.shared-game-visuals_.wheel-hub]:[top:50%] [&_.shared-game-visuals_.wheel-hub]:[left:50%] [&_.shared-game-visuals_.wheel-hub]:[transform:translate(-50%,-50%)]",
  // base · & .shared-game-visuals .land-wheel
  "[&_.shared-game-visuals_.land-wheel]:[animation:1.45s_cubic-bezier(.12,.65,.12,1)_both_shared-visuals-prize-land]",
  // base · & .shared-game-visuals .rolling .wheel-hub
  "[&_.shared-game-visuals_.rolling_.wheel-hub]:[animation:.5s_ease-in-out_infinite_alternate_shared-visuals-hub-pulse]",
  // base · & .shared-game-visuals .duel-cards
  "[&_.shared-game-visuals_.duel-cards]:[gap:62px] [&_.shared-game-visuals_.duel-cards]:flex [&_.shared-game-visuals_.duel-cards]:relative",
  // base · & .shared-game-visuals .duel-side
  "[&_.shared-game-visuals_.duel-side]:text-center",
  // base · & .shared-game-visuals .duel-side small
  "[&_.shared-game-visuals_.duel-side_small]:[letter-spacing:2px] [&_.shared-game-visuals_.duel-side_small]:[color:#ba9f9b] [&_.shared-game-visuals_.duel-side_small]:[margin-bottom:10px] [&_.shared-game-visuals_.duel-side_small]:[font-size:10px] [&_.shared-game-visuals_.duel-side_small]:block",
  // base · & .shared-game-visuals .duel-side.selected small
  "[&_.shared-game-visuals_.duel-side.selected_small]:[color:#ffd9b6]",
  // base · & .shared-game-visuals .duel-card
  "[&_.shared-game-visuals_.duel-card]:[perspective:700px] [&_.shared-game-visuals_.duel-card]:[width:min(80px,46cqh)] [&_.shared-game-visuals_.duel-card]:[height:min(112px,65cqh)]",
  // base · & .shared-game-visuals .card-inner
  "[&_.shared-game-visuals_.card-inner]:w-full [&_.shared-game-visuals_.card-inner]:h-full [&_.shared-game-visuals_.card-inner]:[transform-style:preserve-3d] [&_.shared-game-visuals_.card-inner]:relative",
  // base · & .shared-game-visuals .card-back
  "[&_.shared-game-visuals_.card-back]:[backface-visibility:hidden] [&_.shared-game-visuals_.card-back]:[background:repeating-linear-gradient(45deg,#5a3443_0_5px,#482b3a_5px_10px)] [&_.shared-game-visuals_.card-back]:[border:4px_solid_#ac8179] [&_.shared-game-visuals_.card-back]:[border-radius:9px] [&_.shared-game-visuals_.card-back]:[place-items:center] [&_.shared-game-visuals_.card-back]:grid [&_.shared-game-visuals_.card-back]:absolute [&_.shared-game-visuals_.card-back]:[inset:0] [&_.shared-game-visuals_.card-back]:[box-shadow:0_8px_15px_#0004]",
  // base · & .shared-game-visuals .card-face
  "[&_.shared-game-visuals_.card-face]:[backface-visibility:hidden] [&_.shared-game-visuals_.card-face]:[color:#27302d] [&_.shared-game-visuals_.card-face]:[background:#fff5e4] [&_.shared-game-visuals_.card-face]:[border-radius:9px] [&_.shared-game-visuals_.card-face]:flex-col [&_.shared-game-visuals_.card-face]:justify-between [&_.shared-game-visuals_.card-face]:[padding:8px] [&_.shared-game-visuals_.card-face]:flex [&_.shared-game-visuals_.card-face]:absolute [&_.shared-game-visuals_.card-face]:[inset:0] [&_.shared-game-visuals_.card-face]:[transform:rotateY(180deg)] [&_.shared-game-visuals_.card-face]:[box-shadow:0_8px_15px_#0004]",
  // base · & .shared-game-visuals .card-back span
  "[&_.shared-game-visuals_.card-back_span]:[color:#e5b99d] [&_.shared-game-visuals_.card-back_span]:[border:1px_solid_#b88772] [&_.shared-game-visuals_.card-back_span]:rounded-full [&_.shared-game-visuals_.card-back_span]:[padding:8px] [&_.shared-game-visuals_.card-back_span]:[font-size:32px]",
  // base · & .shared-game-visuals .card-face b
  "[&_.shared-game-visuals_.card-face_b]:[align-self:flex-start] [&_.shared-game-visuals_.card-face_b]:[font-size:17px]",
  // base · & .shared-game-visuals .card-face b:last-child
  "[&_.shared-game-visuals_.card-face_b:last-child]:[align-self:flex-end] [&_.shared-game-visuals_.card-face_b:last-child]:[transform:rotate(180deg)]",
  // base · & .shared-game-visuals .card-face>span
  "[&_.shared-game-visuals_.card-face>span]:[font-size:32px] [&_.shared-game-visuals_.card-face>span]:[line-height:1]",
  // base · & .shared-game-visuals .card-1 .card-face
  "[&_.shared-game-visuals_.card-1_.card-face]:[color:#b34b55]",
  // base · & .shared-game-visuals .revealed .card-inner
  "[&_.shared-game-visuals_.revealed_.card-inner]:[animation:.7s_both_shared-visuals-card-reveal]",
  // base · & .shared-game-visuals .revealed .card-1 .card-inner
  "[&_.shared-game-visuals_.revealed_.card-1_.card-inner]:[animation-delay:.4s]",
  // base · & .shared-game-visuals .rolling .duel-card
  "[&_.shared-game-visuals_.rolling_.duel-card]:[animation:.5s_ease-in-out_infinite_alternate_shared-visuals-card-deal]",
  // base · & .shared-game-visuals .duel-vs
  "[&_.shared-game-visuals_.duel-vs]:[color:#b58a83] [&_.shared-game-visuals_.duel-vs]:[font-size:12px] [&_.shared-game-visuals_.duel-vs]:font-bold [&_.shared-game-visuals_.duel-vs]:absolute [&_.shared-game-visuals_.duel-vs]:[top:60%] [&_.shared-game-visuals_.duel-vs]:[left:50%] [&_.shared-game-visuals_.duel-vs]:[transform:translate(-50%,-50%)]",
  // base · & .shared-game-visuals .slot-machine
  "[&_.shared-game-visuals_.slot-machine]:[background:linear-gradient(#58426a,#30263e)] [&_.shared-game-visuals_.slot-machine]:[border:2px_solid_#aa88c5] [&_.shared-game-visuals_.slot-machine]:[border-radius:18px] [&_.shared-game-visuals_.slot-machine]:[width:90%] [&_.shared-game-visuals_.slot-machine]:[max-width:320px] [&_.shared-game-visuals_.slot-machine]:[padding:12px] [&_.shared-game-visuals_.slot-machine]:relative [&_.shared-game-visuals_.slot-machine]:[box-shadow:0_10px_22px_#0005]",
  // base · & .shared-game-visuals .slot-marquee
  "[&_.shared-game-visuals_.slot-marquee]:[color:#f3d68d] [&_.shared-game-visuals_.slot-marquee]:[letter-spacing:3px] [&_.shared-game-visuals_.slot-marquee]:[justify-content:space-around] [&_.shared-game-visuals_.slot-marquee]:items-center [&_.shared-game-visuals_.slot-marquee]:[margin-bottom:10px] [&_.shared-game-visuals_.slot-marquee]:[font-size:11px] [&_.shared-game-visuals_.slot-marquee]:[font-weight:800] [&_.shared-game-visuals_.slot-marquee]:flex",
  // base · & .shared-game-visuals .slot-marquee i
  "[&_.shared-game-visuals_.slot-marquee_i]:[background:#ffeab0] [&_.shared-game-visuals_.slot-marquee_i]:rounded-full [&_.shared-game-visuals_.slot-marquee_i]:[width:6px] [&_.shared-game-visuals_.slot-marquee_i]:[height:6px] [&_.shared-game-visuals_.slot-marquee_i]:[box-shadow:0_0_8px_#ffdf80]",
  // base · & .shared-game-visuals .slot-reels
  "[&_.shared-game-visuals_.slot-reels]:[grid-template-columns:repeat(3,1fr)] [&_.shared-game-visuals_.slot-reels]:[gap:5px] [&_.shared-game-visuals_.slot-reels]:grid",
  // base · & .shared-game-visuals .slot-reel
  "[&_.shared-game-visuals_.slot-reel]:[background:linear-gradient(#cfc9c4,#fff9ec_30%_70%,#cfc9c4)] [&_.shared-game-visuals_.slot-reel]:[border-radius:8px] [&_.shared-game-visuals_.slot-reel]:[height:72px] [&_.shared-game-visuals_.slot-reel]:overflow-hidden [&_.shared-game-visuals_.slot-reel]:[box-shadow:inset_0_2px_8px_#0005]",
  // base · & .shared-game-visuals .reel-strip>span
  "[&_.shared-game-visuals_.reel-strip>span]:[place-items:center] [&_.shared-game-visuals_.reel-strip>span]:[height:72px] [&_.shared-game-visuals_.reel-strip>span]:[font-size:38px] [&_.shared-game-visuals_.reel-strip>span]:grid",
  // base · & .shared-game-visuals .rolling .reel-strip
  "[&_.shared-game-visuals_.rolling_.reel-strip]:[filter:blur(1px)] [&_.shared-game-visuals_.rolling_.reel-strip]:[animation:.32s_linear_infinite_shared-visuals-reel-roll]",
  // base · & .shared-game-visuals .rolling .reel-1 .reel-strip
  "[&_.shared-game-visuals_.rolling_.reel-1_.reel-strip]:[animation-duration:.25s]",
  // base · & .shared-game-visuals .rolling .reel-2 .reel-strip
  "[&_.shared-game-visuals_.rolling_.reel-2_.reel-strip]:[animation-duration:.2s]",
  // base · & .shared-game-visuals .revealed .reel-strip
  "[&_.shared-game-visuals_.revealed_.reel-strip]:[animation:.5s_both_shared-visuals-reel-stop]",
  // base · & .shared-game-visuals .revealed .reel-1 .reel-strip
  "[&_.shared-game-visuals_.revealed_.reel-1_.reel-strip]:[animation-delay:.3s]",
  // base · & .shared-game-visuals .revealed .reel-2 .reel-strip
  "[&_.shared-game-visuals_.revealed_.reel-2_.reel-strip]:[animation-delay:.6s]",
  // base · & .shared-game-visuals .slot-machine>small
  "[&_.shared-game-visuals_.slot-machine>small]:[color:#dbc5ee] [&_.shared-game-visuals_.slot-machine>small]:[letter-spacing:1px] [&_.shared-game-visuals_.slot-machine>small]:justify-between [&_.shared-game-visuals_.slot-machine>small]:[margin-top:10px] [&_.shared-game-visuals_.slot-machine>small]:[font-size:9px] [&_.shared-game-visuals_.slot-machine>small]:flex",
  // base · & .shared-game-visuals .slot-payline
  "[&_.shared-game-visuals_.slot-payline]:[background:#ffd06e] [&_.shared-game-visuals_.slot-payline]:rounded-full [&_.shared-game-visuals_.slot-payline]:[width:6px] [&_.shared-game-visuals_.slot-payline]:[height:6px] [&_.shared-game-visuals_.slot-payline]:absolute [&_.shared-game-visuals_.slot-payline]:[top:50%] [&_.shared-game-visuals_.slot-payline]:[left:3px] [&_.shared-game-visuals_.slot-payline]:[box-shadow:0_0_8px_#ffd06e]",
  // base · & .shared-game-visuals .hand-duel
  "[&_.shared-game-visuals_.hand-duel]:text-center [&_.shared-game-visuals_.hand-duel]:items-center [&_.shared-game-visuals_.hand-duel]:[gap:20px] [&_.shared-game-visuals_.hand-duel]:flex",
  // base · & .shared-game-visuals .hand-duel>div
  "[&_.shared-game-visuals_.hand-duel>div]:[width:100px]",
  // base · & .shared-game-visuals .hand-duel small
  "[&_.shared-game-visuals_.hand-duel_small]:[letter-spacing:1px] [&_.shared-game-visuals_.hand-duel_small]:[color:#a3b8cb] [&_.shared-game-visuals_.hand-duel_small]:[font-size:9px]",
  // base · & .shared-game-visuals .hand-duel span
  "[&_.shared-game-visuals_.hand-duel_span]:[background:#ffffff08] [&_.shared-game-visuals_.hand-duel_span]:[border:1px_solid_#adcbea33] [&_.shared-game-visuals_.hand-duel_span]:rounded-full [&_.shared-game-visuals_.hand-duel_span]:[place-items:center] [&_.shared-game-visuals_.hand-duel_span]:[width:84px] [&_.shared-game-visuals_.hand-duel_span]:[height:84px] [&_.shared-game-visuals_.hand-duel_span]:[margin:10px_auto] [&_.shared-game-visuals_.hand-duel_span]:[font-size:43px] [&_.shared-game-visuals_.hand-duel_span]:grid",
  // base · & .shared-game-visuals .hand-duel b
  "[&_.shared-game-visuals_.hand-duel_b]:[text-transform:capitalize] [&_.shared-game-visuals_.hand-duel_b]:[color:#c5dff2] [&_.shared-game-visuals_.hand-duel_b]:[font-size:12px]",
  // base · & .shared-game-visuals .hand-duel em
  "[&_.shared-game-visuals_.hand-duel_em]:[color:#89a5ba] [&_.shared-game-visuals_.hand-duel_em]:[font-size:12px] [&_.shared-game-visuals_.hand-duel_em]:[font-style:normal]",
  // base · & .shared-game-visuals .rolling .hand-duel span
  "[&_.shared-game-visuals_.rolling_.hand-duel_span]:[animation:.35s_ease-in-out_infinite_alternate_shared-visuals-hand-shake]",
  // base · & .shared-game-visuals .rolling .opponent-hand
  "[&_.shared-game-visuals_.rolling_.opponent-hand]:[animation-delay:.15s]",
  // base · & .shared-game-visuals .revealed .opponent-hand
  "[&_.shared-game-visuals_.revealed_.opponent-hand]:[animation:.65s_both_shared-visuals-hand-reveal]",
  // base · & .shared-game-visuals .game-theater.win
  "[&_.shared-game-visuals_.game-theater.win]:[border-color:var(--accent)] [&_.shared-game-visuals_.game-theater.win]:[box-shadow:inset_0_0_25px_#ffffff0b]",
  // base · & .shared-game-visuals .win-sparks
  "[&_.shared-game-visuals_.win-sparks]:pointer-events-none [&_.shared-game-visuals_.win-sparks]:absolute [&_.shared-game-visuals_.win-sparks]:[inset:50%]",
  // base · & .shared-game-visuals .win-sparks i
  "[&_.shared-game-visuals_.win-sparks_i]:[background:var(--accent)] [&_.shared-game-visuals_.win-sparks_i]:[width:5px] [&_.shared-game-visuals_.win-sparks_i]:[height:9px] [&_.shared-game-visuals_.win-sparks_i]:[transform:rotate(var(--spark-angle))] [&_.shared-game-visuals_.win-sparks_i]:[border-radius:2px] [&_.shared-game-visuals_.win-sparks_i]:[animation:1s_ease-out_both_shared-visuals-spark-burst] [&_.shared-game-visuals_.win-sparks_i]:absolute",
  // (max-width:800px) · & .shared-game-visuals .game-theater
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.game-theater]:[height:155px]",
  // (max-width:800px) · & .shared-game-visuals .instant-shell .player-title h1
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.instant-shell_.player-title_h1]:[font-size:20px]",
  // (max-width:800px) · & .shared-game-visuals .prize-wheel-wrap
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.prize-wheel-wrap]:[width:140px] [@media_(max-width:800px)]:[&_.shared-game-visuals_.prize-wheel-wrap]:[height:140px]",
  // (max-width:800px) · & .shared-game-visuals .game-die
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.game-die]:[border-radius:13px] [@media_(max-width:800px)]:[&_.shared-game-visuals_.game-die]:[gap:5px] [@media_(max-width:800px)]:[&_.shared-game-visuals_.game-die]:[width:65px] [@media_(max-width:800px)]:[&_.shared-game-visuals_.game-die]:[height:65px] [@media_(max-width:800px)]:[&_.shared-game-visuals_.game-die]:[margin-bottom:22px] [@media_(max-width:800px)]:[&_.shared-game-visuals_.game-die]:[padding:11px]",
  // (max-width:800px) · & .shared-game-visuals .dice-orbit
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.dice-orbit]:[width:130px] [@media_(max-width:800px)]:[&_.shared-game-visuals_.dice-orbit]:[bottom:30px]",
  // (max-width:800px) · & .shared-game-visuals .theater-caption
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.theater-caption]:[bottom:7px]",
  // (max-width:800px) · & .shared-game-visuals .duel-card
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.duel-card]:[width:64px] [@media_(max-width:800px)]:[&_.shared-game-visuals_.duel-card]:[height:88px]",
  // (max-width:800px) · & .shared-game-visuals .duel-side small
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.duel-side_small]:[margin-bottom:6px]",
  // (max-width:800px) · & .shared-game-visuals .card-face
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.card-face]:[padding:5px]",
  // (max-width:800px) · & .shared-game-visuals .card-face b
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.card-face_b]:[font-size:13px]",
  // (max-width:800px) · & .shared-game-visuals .card-face>span
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.card-face>span]:[font-size:25px]",
  // (max-width:800px) · & .shared-game-visuals .hand-duel span
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.hand-duel_span]:[width:65px] [@media_(max-width:800px)]:[&_.shared-game-visuals_.hand-duel_span]:[height:65px] [@media_(max-width:800px)]:[&_.shared-game-visuals_.hand-duel_span]:[margin:7px_auto] [@media_(max-width:800px)]:[&_.shared-game-visuals_.hand-duel_span]:[font-size:34px]",
  // (max-width:800px) · & .shared-game-visuals .slot-machine
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.slot-machine]:[padding:9px]",
  // (max-width:800px) · & .shared-game-visuals .slot-marquee
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.slot-marquee]:[margin-bottom:7px]",
  // (max-width:800px) · & .shared-game-visuals .slot-machine>small
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.slot-machine>small]:[margin-top:7px]",
  // (prefers-reduced-motion:reduce) · & .shared-game-visuals .game-theater *
  "[@media_(prefers-reduced-motion:reduce)]:[&_.shared-game-visuals_.game-theater_*]:[animation:none]!",
  // (prefers-reduced-motion:reduce) · & .shared-game-visuals .revealed .card-inner
  "[@media_(prefers-reduced-motion:reduce)]:[&_.shared-game-visuals_.revealed_.card-inner]:[transform:rotateY(180deg)]",
  // (prefers-reduced-motion:reduce) · & .shared-game-visuals .land-wheel
  "[@media_(prefers-reduced-motion:reduce)]:[&_.shared-game-visuals_.land-wheel]:[transform:rotate(var(--landing))]",
  // (prefers-reduced-motion:reduce) · & .shared-game-visuals .win-sparks
  "[@media_(prefers-reduced-motion:reduce)]:[&_.shared-game-visuals_.win-sparks]:hidden",
  // base · & .shared-game-visuals .instant-flip
  "[&_.shared-game-visuals_.instant-flip]:[--accent:#f0cf82] [&_.shared-game-visuals_.instant-flip]:[background:linear-gradient(150deg,#393728,#202a23)]",
  // base · & .shared-game-visuals .theater-flip
  "[&_.shared-game-visuals_.theater-flip]:[perspective:800px]",
  // base · & .shared-game-visuals .coin-halo
  "[&_.shared-game-visuals_.coin-halo]:[border:1px_solid_#efd18a22] [&_.shared-game-visuals_.coin-halo]:rounded-full [&_.shared-game-visuals_.coin-halo]:[width:145px] [&_.shared-game-visuals_.coin-halo]:[height:145px] [&_.shared-game-visuals_.coin-halo]:absolute [&_.shared-game-visuals_.coin-halo]:[box-shadow:0_0_0_20px_#e5c77d05,0_0_0_40px_#e5c77d04]",
  // base · & .shared-game-visuals .coin-flight
  "[&_.shared-game-visuals_.coin-flight]:[transform-style:preserve-3d] [&_.shared-game-visuals_.coin-flight]:[width:min(104px,65cqh)] [&_.shared-game-visuals_.coin-flight]:[height:min(104px,65cqh)] [&_.shared-game-visuals_.coin-flight]:[margin-bottom:15px] [&_.shared-game-visuals_.coin-flight]:relative",
  // base · & .shared-game-visuals .lucky-coin
  "[&_.shared-game-visuals_.lucky-coin]:w-full [&_.shared-game-visuals_.lucky-coin]:h-full [&_.shared-game-visuals_.lucky-coin]:[transform-style:preserve-3d] [&_.shared-game-visuals_.lucky-coin]:[transform:rotateY(var(--coin-rest))] [&_.shared-game-visuals_.lucky-coin]:relative",
  // base · & .shared-game-visuals .coin-face
  "[&_.shared-game-visuals_.coin-face]:[backface-visibility:hidden] [&_.shared-game-visuals_.coin-face]:[outline-offset:-10px] [&_.shared-game-visuals_.coin-face]:[color:#75511d] [&_.shared-game-visuals_.coin-face]:[background:radial-gradient(circle_at_30%_20%,#fff1ba,#e5bf62_55%,#bd8531)] [&_.shared-game-visuals_.coin-face]:[border:5px_solid_#d3a748] [&_.shared-game-visuals_.coin-face]:rounded-full [&_.shared-game-visuals_.coin-face]:[outline:2px_solid_#f6e3a8] [&_.shared-game-visuals_.coin-face]:flex-col [&_.shared-game-visuals_.coin-face]:justify-center [&_.shared-game-visuals_.coin-face]:items-center [&_.shared-game-visuals_.coin-face]:flex [&_.shared-game-visuals_.coin-face]:absolute [&_.shared-game-visuals_.coin-face]:[inset:0] [&_.shared-game-visuals_.coin-face]:[box-shadow:inset_0_0_12px_#9a681d66]",
  // base · & .shared-game-visuals .coin-tails
  "[&_.shared-game-visuals_.coin-tails]:[background:radial-gradient(circle_at_30%_20%,#fff1c6,#d8ab56_60%,#b47d2c)] [&_.shared-game-visuals_.coin-tails]:[transform:rotateY(180deg)]",
  // base · & .shared-game-visuals .coin-face small
  "[&_.shared-game-visuals_.coin-face_small]:[letter-spacing:2px] [&_.shared-game-visuals_.coin-face_small]:[font-size:7px]",
  // base · & .shared-game-visuals .coin-face b
  "[&_.shared-game-visuals_.coin-face_b]:[text-shadow:1px_1px_#fff2c4] [&_.shared-game-visuals_.coin-face_b]:[font-family:Georgia,serif] [&_.shared-game-visuals_.coin-face_b]:[font-size:45px] [&_.shared-game-visuals_.coin-face_b]:[line-height:1.1]",
  // base · & .shared-game-visuals .coin-face>span
  "[&_.shared-game-visuals_.coin-face>span]:[letter-spacing:2px] [&_.shared-game-visuals_.coin-face>span]:[font-size:9px] [&_.shared-game-visuals_.coin-face>span]:font-bold",
  // base · & .shared-game-visuals .coin-shadow
  "[&_.shared-game-visuals_.coin-shadow]:[filter:blur(4px)] [&_.shared-game-visuals_.coin-shadow]:[background:#0006] [&_.shared-game-visuals_.coin-shadow]:rounded-full [&_.shared-game-visuals_.coin-shadow]:[width:95px] [&_.shared-game-visuals_.coin-shadow]:[height:13px] [&_.shared-game-visuals_.coin-shadow]:absolute [&_.shared-game-visuals_.coin-shadow]:[bottom:35px]",
  // base · & .shared-game-visuals .coin-caption
  "[&_.shared-game-visuals_.coin-caption]:[letter-spacing:2px] [&_.shared-game-visuals_.coin-caption]:[color:#d8c99e] [&_.shared-game-visuals_.coin-caption]:[font-size:9px] [&_.shared-game-visuals_.coin-caption]:absolute [&_.shared-game-visuals_.coin-caption]:[bottom:12px]",
  // base · & .shared-game-visuals .tossing .coin-flight
  "[&_.shared-game-visuals_.tossing_.coin-flight]:[animation:.55s_ease-in-out_infinite_alternate_shared-visuals-coin-lift]",
  // base · & .shared-game-visuals .tossing .lucky-coin
  "[&_.shared-game-visuals_.tossing_.lucky-coin]:[animation:.45s_linear_infinite_shared-visuals-coin-turn]",
  // base · & .shared-game-visuals .tossing .coin-shadow
  "[&_.shared-game-visuals_.tossing_.coin-shadow]:[animation:.55s_ease-in-out_infinite_alternate_shared-visuals-coin-shadow-pulse]",
  // base · & .shared-game-visuals .coin-revealed .lucky-coin
  "[&_.shared-game-visuals_.coin-revealed_.lucky-coin]:[animation:1.35s_cubic-bezier(.15,.6,.18,1)_both_shared-visuals-coin-finish]",
  // base · & .shared-game-visuals .coin-revealed .coin-flight
  "[&_.shared-game-visuals_.coin-revealed_.coin-flight]:[animation:1.35s_both_shared-visuals-coin-touchdown]",
  // base · & .shared-game-visuals .instant-roulette
  "[&_.shared-game-visuals_.instant-roulette]:[--accent:#ebcb83] [&_.shared-game-visuals_.instant-roulette]:[background:linear-gradient(145deg,#263e33,#14251e)] [&_.shared-game-visuals_.instant-roulette]:[border-color:#8c784a]",
  // base · & .shared-game-visuals .instant-roulette .roulette-stage
  "[&_.shared-game-visuals_.instant-roulette_.roulette-stage]:[background:radial-gradient(#52774c33,#0002_70%)] [&_.shared-game-visuals_.instant-roulette_.roulette-stage]:[border:1px_solid_#b3c9981a] [&_.shared-game-visuals_.instant-roulette_.roulette-stage]:[border-radius:16px] [&_.shared-game-visuals_.instant-roulette_.roulette-stage]:[margin-bottom:12px] [&_.shared-game-visuals_.instant-roulette_.roulette-stage]:[padding:10px_0_8px]",
  // base · & .shared-game-visuals .roulette-wheel-frame
  "[&_.shared-game-visuals_.roulette-wheel-frame]:[background:#17271f] [&_.shared-game-visuals_.roulette-wheel-frame]:[border:5px_solid_#b79752] [&_.shared-game-visuals_.roulette-wheel-frame]:rounded-full [&_.shared-game-visuals_.roulette-wheel-frame]:[width:min(240px,85cqh)] [&_.shared-game-visuals_.roulette-wheel-frame]:[height:min(240px,85cqh)] [&_.shared-game-visuals_.roulette-wheel-frame]:[margin:0_auto] [&_.shared-game-visuals_.roulette-wheel-frame]:relative [&_.shared-game-visuals_.roulette-wheel-frame]:[box-shadow:0_0_0_3px_#283c2a,0_0_0_5px_#b7975244,0_10px_25px_#0006]",
  // base · & .shared-game-visuals .roulette-wheel-frame img
  "[&_.shared-game-visuals_.roulette-wheel-frame_img]:[filter:none] [&_.shared-game-visuals_.roulette-wheel-frame_img]:object-contain [&_.shared-game-visuals_.roulette-wheel-frame_img]:w-full [&_.shared-game-visuals_.roulette-wheel-frame_img]:h-full [&_.shared-game-visuals_.roulette-wheel-frame_img]:[transition:transform_2.2s_cubic-bezier(.12,.72,.12,1)] [&_.shared-game-visuals_.roulette-wheel-frame_img]:block",
  // base · & .shared-game-visuals .roulette-wheel-frame .wheel-pointer
  "[&_.shared-game-visuals_.roulette-wheel-frame_.wheel-pointer]:[background:#ffe5a7] [&_.shared-game-visuals_.roulette-wheel-frame_.wheel-pointer]:[width:14px] [&_.shared-game-visuals_.roulette-wheel-frame_.wheel-pointer]:[height:19px] [&_.shared-game-visuals_.roulette-wheel-frame_.wheel-pointer]:[top:-8px] [&_.shared-game-visuals_.roulette-wheel-frame_.wheel-pointer]:[left:calc(50%_-_7px)]",
  // base · & .shared-game-visuals .roulette-center
  "[&_.shared-game-visuals_.roulette-center]:[color:#57401e] [&_.shared-game-visuals_.roulette-center]:pointer-events-none [&_.shared-game-visuals_.roulette-center]:[background:linear-gradient(135deg,#f9dda0,#a47b34)] [&_.shared-game-visuals_.roulette-center]:[border:3px_solid_#a17a39] [&_.shared-game-visuals_.roulette-center]:rounded-full [&_.shared-game-visuals_.roulette-center]:[place-items:center] [&_.shared-game-visuals_.roulette-center]:[width:29px] [&_.shared-game-visuals_.roulette-center]:[height:29px] [&_.shared-game-visuals_.roulette-center]:[font-size:13px] [&_.shared-game-visuals_.roulette-center]:[font-weight:800] [&_.shared-game-visuals_.roulette-center]:grid [&_.shared-game-visuals_.roulette-center]:absolute [&_.shared-game-visuals_.roulette-center]:[top:50%] [&_.shared-game-visuals_.roulette-center]:[left:50%] [&_.shared-game-visuals_.roulette-center]:[transform:translate(-50%,-50%)]",
  // base · & .shared-game-visuals .roulette-ball
  "[&_.shared-game-visuals_.roulette-ball]:[z-index:2] [&_.shared-game-visuals_.roulette-ball]:[background:#fff9e8] [&_.shared-game-visuals_.roulette-ball]:rounded-full [&_.shared-game-visuals_.roulette-ball]:[width:6px] [&_.shared-game-visuals_.roulette-ball]:[height:6px] [&_.shared-game-visuals_.roulette-ball]:absolute [&_.shared-game-visuals_.roulette-ball]:[top:7%] [&_.shared-game-visuals_.roulette-ball]:[left:calc(50%_-_3px)] [&_.shared-game-visuals_.roulette-ball]:[box-shadow:0_0_5px_#ffefb9]",
  // base · & .shared-game-visuals .wheel-in-motion .roulette-center
  "[&_.shared-game-visuals_.wheel-in-motion_.roulette-center]:[animation:.5s_ease-in-out_infinite_alternate_shared-visuals-hub-pulse]",
  // base · & .shared-game-visuals .wheel-settled .roulette-result>b
  "[&_.shared-game-visuals_.wheel-settled_.roulette-result>b]:[animation:.5s_both_shared-visuals-pocket-reveal]",
  // base · & .shared-game-visuals .wheel-settled.win .roulette-wheel-frame
  "[&_.shared-game-visuals_.wheel-settled.win_.roulette-wheel-frame]:[box-shadow:0_0_0_3px_#283c2a,0_0_0_5px_#e3c07888,0_0_30px_#e3c07844]",
  // base · & .shared-game-visuals .instant-roulette .roulette-market
  "[&_.shared-game-visuals_.instant-roulette_.roulette-market]:[transition:background_.2s,border-color_.2s,box-shadow_.2s] [&_.shared-game-visuals_.instant-roulette_.roulette-market]:[box-shadow:0_3px_#0002]",
  // base · & .shared-game-visuals .instant-roulette .roulette-market.winning-market
  "[&_.shared-game-visuals_.instant-roulette_.roulette-market.winning-market]:[background:#536039] [&_.shared-game-visuals_.instant-roulette_.roulette-market.winning-market]:[border-color:#e7d38a] [&_.shared-game-visuals_.instant-roulette_.roulette-market.winning-market]:[box-shadow:inset_0_0_0_1px_#f1db8d,0_0_12px_#e8cb6540]",
  // base · & .shared-game-visuals .instant-roulette .roulette-market em
  "[&_.shared-game-visuals_.instant-roulette_.roulette-market_em]:[animation:.25s_both_shared-visuals-pocket-reveal]",
  // base · & .shared-game-visuals .instant-roulette .chip-selector button
  "[&_.shared-game-visuals_.instant-roulette_.chip-selector_button]:[transition:transform_.15s,background_.15s]",
  // base · & .shared-game-visuals .instant-roulette .chip-selector button.chosen
  "[&_.shared-game-visuals_.instant-roulette_.chip-selector_button.chosen]:[color:#fff2cb] [&_.shared-game-visuals_.instant-roulette_.chip-selector_button.chosen]:[background:#8a733e] [&_.shared-game-visuals_.instant-roulette_.chip-selector_button.chosen]:[border-color:#f2db9b] [&_.shared-game-visuals_.instant-roulette_.chip-selector_button.chosen]:[transform:translateY(-3px)]",
  // (max-width:800px) · & .shared-game-visuals .coin-flight
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.coin-flight]:[width:80px] [@media_(max-width:800px)]:[&_.shared-game-visuals_.coin-flight]:[height:80px]",
  // (max-width:800px) · & .shared-game-visuals .coin-face b
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.coin-face_b]:[font-size:33px]",
  // (max-width:800px) · & .shared-game-visuals .coin-face small
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.coin-face_small]:[font-size:6px]",
  // (max-width:800px) · & .shared-game-visuals .coin-face>span
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.coin-face>span]:[font-size:7px]",
  // (max-width:800px) · & .shared-game-visuals .coin-halo
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.coin-halo]:[width:110px] [@media_(max-width:800px)]:[&_.shared-game-visuals_.coin-halo]:[height:110px]",
  // (max-width:800px) · & .shared-game-visuals .coin-shadow
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.coin-shadow]:[width:75px] [@media_(max-width:800px)]:[&_.shared-game-visuals_.coin-shadow]:[bottom:24px]",
  // (max-width:800px) · & .shared-game-visuals .coin-caption
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.coin-caption]:[bottom:8px]",
  // (max-width:800px) · & .shared-game-visuals .instant-roulette .roulette-stage
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.instant-roulette_.roulette-stage]:[margin-bottom:8px] [@media_(max-width:800px)]:[&_.shared-game-visuals_.instant-roulette_.roulette-stage]:[padding:9px_0_5px]",
  // (max-width:800px) · & .shared-game-visuals .roulette-wheel-frame
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.roulette-wheel-frame]:[border-width:3px] [@media_(max-width:800px)]:[&_.shared-game-visuals_.roulette-wheel-frame]:[width:140px] [@media_(max-width:800px)]:[&_.shared-game-visuals_.roulette-wheel-frame]:[height:140px]",
  // (max-width:800px) · & .shared-game-visuals .roulette-wheel-frame img
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.roulette-wheel-frame_img]:w-full [@media_(max-width:800px)]:[&_.shared-game-visuals_.roulette-wheel-frame_img]:h-full",
  // (max-width:800px) · & .shared-game-visuals .roulette-center
  "[@media_(max-width:800px)]:[&_.shared-game-visuals_.roulette-center]:[border-width:2px] [@media_(max-width:800px)]:[&_.shared-game-visuals_.roulette-center]:[width:22px] [@media_(max-width:800px)]:[&_.shared-game-visuals_.roulette-center]:[height:22px] [@media_(max-width:800px)]:[&_.shared-game-visuals_.roulette-center]:[font-size:10px]",
  // (prefers-reduced-motion:reduce) · & .shared-game-visuals .coin-revealed .lucky-coin
  "[@media_(prefers-reduced-motion:reduce)]:[&_.shared-game-visuals_.coin-revealed_.lucky-coin]:[transform:rotateY(var(--coin-rest))]",
  // (prefers-reduced-motion:reduce) · & .shared-game-visuals .roulette-wheel-frame img
  "[@media_(prefers-reduced-motion:reduce)]:[&_.shared-game-visuals_.roulette-wheel-frame_img]:[transition:none]",
  // (prefers-reduced-motion:reduce) · & .shared-game-visuals .instant-roulette *
  "[@media_(prefers-reduced-motion:reduce)]:[&_.shared-game-visuals_.instant-roulette_*]:[transition:none]! [@media_(prefers-reduced-motion:reduce)]:[&_.shared-game-visuals_.instant-roulette_*]:[animation:none]!",
  // base · & .shared-game-visuals
  "[&_.shared-game-visuals]:[--accent:#ebcb83] [&_.shared-game-visuals]:[place-items:center] [&_.shared-game-visuals]:w-full [&_.shared-game-visuals]:h-full [&_.shared-game-visuals]:[min-height:0] [&_.shared-game-visuals]:grid",
  // base · & .shared-game-visuals .theater-highlow
  "[&_.shared-game-visuals_.theater-highlow]:[--accent:#aee5b0]",
].join(" ");
