/* Self-contained presentation for this event bundle. No ranking or reward writes. */
window.RankingDesign = (() => {
  const $ = id => document.getElementById(id);
  const node = (tag, classes = '', text) => { const n = document.createElement(tag); n.className = classes; if (text !== undefined) n.textContent = text; return n; };
  function art(file, classes) { const n = node('img', classes); n.src = `assets/${file}`; n.alt = ''; n.draggable = false; return n; }
  const animations = new Set();
  const animationData = new Map();
  function animatedArt(file, fallback) {
    const container = node('div', 'pointer-events-none absolute inset-0 h-full w-full');
    const poster = art(fallback, 'absolute inset-0 h-full w-full object-contain');
    const canvas = node('canvas', 'absolute inset-0 h-full w-full object-contain');
    container.append(poster, canvas);
    const state = { disposed: false, player: null };
    animations.add(state);
    async function play() {
      try {
        if (!window.SVGA) return;
        if (!animationData.has(file)) {
          const parser = new SVGA.Parser({ disableWorker: true });
          const data = fetch(`assets/${file}`).then(response => {
            if (!response.ok) throw new Error('Animation unavailable');
            return response.arrayBuffer();
          }).then(bytes => parser.do(bytes)).finally(() => parser.destroy());
          animationData.set(file, data);
          data.catch(() => animationData.delete(file));
        }
        const data = await animationData.get(file);
        if (state.disposed) return;
        const player = new SVGA.Player(canvas);
        state.player = player;
        player.set({ loop: true, cacheFrames: false });
        await player.mount(data);
        if (state.disposed) return;
        poster.hidden = true;
        player.start();
        if (document.hidden) player.pause();
      } catch {
        canvas.remove();
        poster.hidden = false;
      }
    }
    play();
    return container;
  }
  function clearAnimations() {
    for (const state of animations) {
      state.disposed = true;
      state.player?.destroy();
    }
    animations.clear();
  }
  document.addEventListener('visibilitychange', () => {
    for (const { player } of animations) {
      if (document.hidden) player?.pause();
      else player?.resume();
    }
  });
  window.addEventListener('pagehide', clearAnimations);
  function portrait(person, notify, classes = '', agency = false) {
    const b = node(agency ? 'button' : 'div', `block overflow-hidden rounded-full bg-[#10051b] ${classes}`); if (agency) b.type = 'button';
    if (person?.profileImage && /^(https?:\/\/|\/)/i.test(person.profileImage)) { const im = node('img','h-full w-full object-cover'); im.src = person.profileImage; im.alt = person.name || ''; im.onerror=()=>im.remove(); b.append(im); }
    else b.append(node('span','text-xl text-slate-300','●'));
    return b;
  }
  function badges(person) {
    const n=node('div','owned-badges flex h-5 items-center justify-center gap-1');const seen=new Set();
    for(const b of person?.ownedBadges||[]){if(seen.size===5)break;const url=b.mimeType?.startsWith('image/')?b.url:b.posterUrl;if(!url||seen.has(b.assetId||url))continue;seen.add(b.assetId||url);const im=node('img','h-4 w-4 object-contain');im.src=url;im.alt=b.name||'Badge';im.onerror=()=>im.remove();n.append(im);}return n;
  }
  function details(e, type, helpers) {
    const n=node('div','relative z-10 mx-auto flex min-w-0 max-w-full flex-col items-center gap-0.5 px-1 text-[10px]');
    const name=node(type==='agency'?'button':'span','entry-name max-w-full truncate font-semibold',e.name);
    if(type==='agency'){name.type='button';name.onclick=()=>helpers.notify({type:'ranking:open-agency',agencyPublicId:e.id});}
    n.append(name);
    if(type==='agency')n.append(node('span','text-[9px]',String(e.id ?? '').replace(/^AGN[-_ ]*/i,'')));
    const levels=helpers.levels(e.person,e);levels.className='flex max-w-full flex-wrap items-center justify-center gap-1 [&_img]:max-h-4 [&_img]:max-w-10 [&_.level-tag]:relative [&_.level-tag]:inline-flex [&_.level-tag]:items-center [&_.level-tag]:justify-center [&_.level-tag]:min-w-7 [&_.level-background]:absolute [&_.level-background]:inset-0 [&_.level-background]:h-full [&_.level-background]:w-full [&_b]:relative [&_b]:z-10 [&_b]:text-[9px]';
    n.append(levels);if(type!=='agency')n.append(badges(e.person));return n;
  }
  const themes={
    agency:{background:'bg-[url(assets/agency-background.png)]',period:'bg-[url(assets/agency-period.png)]',active:'bg-[url(assets/agency-active.png)]',board:'bg-gradient-to-br from-amber-600 to-amber-950'},
    cp:{background:'bg-[url(assets/sweet-background.png)]',period:'bg-[url(assets/cp-period.png)]',active:'bg-[url(assets/cp-active.png)]',board:'bg-rose-950/20'},
    wealth:{background:'bg-[url(assets/wealth-palace.png)]',period:'bg-[url(assets/wealth-period-bar.png)]',active:'bg-[url(assets/wealth-period-active.png)]',board:'bg-gradient-to-b from-red-800 to-red-950'},
    charm:{background:'bg-[url(assets/charm-palace.png)]',period:'bg-[url(assets/charm-period-bar.png)]',active:'bg-[url(assets/charm-period-active.png)]',board:'bg-slate-900/80'},
  };
  function theme(type){
    const t=themes[type === 'game' ? 'wealth' : type];$('ranking').className=`relative mx-auto min-h-screen max-w-[440px] overflow-hidden bg-cover bg-top pb-8 ${t.background}`;
    $('filters').className=type==='agency'?'relative z-10 mt-[52%] px-3':'relative z-10 mt-3 px-3';
    $('periods').className=`flex h-12 items-center bg-[length:100%_300%] bg-center bg-no-repeat ${t.period}`;
    for(const b of $('periods').children)b.className=`h-full min-w-0 flex-1 bg-[length:100%_100%] bg-no-repeat text-sm ${b.getAttribute('aria-selected')==='true'?t.active:''}`;
    $('board').className=`relative rounded-t-3xl border-t border-amber-400 px-2 pb-6 ${t.board}`;
    $('search').hidden=type!=='agency';
    $('timing').className=type==='cp'?'mx-auto my-4 flex w-fit items-center gap-3 rounded-full border border-amber-300 bg-purple-950/80 px-5 py-2 text-sm':'mx-auto my-1 flex w-fit items-center gap-2 rounded-full border border-yellow-400 bg-slate-950 px-3 py-1 text-xs';
    if(type==='cp')$('board').before($('timing'));else $('hero').before($('timing'));
  }

  function sweetPair(entry, notify, first = false) {
    const pair = node('div', first ? 'relative z-10 aspect-[500/281] w-full' : 'relative z-10 aspect-[1784/887] w-full');
    const positions = first
      ? ['left-[24%] top-[28%] h-[40%] w-[24%]', 'left-[51%] top-[28%] h-[40%] w-[24%]']
      : ['left-[12%] top-[15%] h-[65%] w-[35%]', 'left-[51%] top-[15%] h-[65%] w-[35%]'];
    pair.append(portrait(entry?.person, notify, `absolute ${positions[0]}`));
    pair.append(portrait(entry?.partner, notify, `absolute ${positions[1]}`));
    pair.append(first ? animatedArt('sweet-first-frame.svga', 'sweet-first-frame.png') : art('sweet-pair-frame.png', 'pointer-events-none absolute inset-0 h-full w-full'));
    return pair;
  }
  function sweetCard(entry, rank, notify) {
    const first = rank === 1;
    const card = node('article', first ? 'relative col-span-2 mx-auto w-full' : 'relative w-full');
    card.append(sweetPair(entry, notify, first));
    const pennant = node('div', first ? 'relative mx-auto -mt-12 aspect-[1166/1350] w-[36%]' : 'relative mx-auto -mt-4 aspect-[1166/1350] w-[76%]');
    pennant.append(art(['sweet-first.png','sweet-second.png','sweet-third.png'][rank-1], 'absolute inset-0 h-full w-full'));
    card.append(pennant);
    if(entry) card.append(node('p','relative z-10 mx-2 truncate text-center text-xs',`${entry.person?.name || 'Unavailable'} & ${entry.partner?.name || 'Unavailable'}`));
    return card;
  }
  function sweetRender(entries, helpers) {
    const banner = node('div','relative mx-auto aspect-[396/288] w-full');
    banner.append(art('cp-header.gif','block h-full w-full object-contain'));
    $('wheel').append(banner);
    const rules=node('button','ml-auto mr-3 my-2 block rounded-full border border-amber-300 bg-purple-950 px-5 py-1 text-sm font-bold','Rules');
    rules.type='button'; rules.onclick=()=>$('rules-dialog').showModal(); $('wheel').append(rules);
    const heading = node('h2','mx-auto my-3 flex h-12 w-[74%] items-center justify-center bg-[url(assets/sweet-label.png)] bg-[length:100%_100%] text-base font-bold','Top 3 couples');
    $('hero').append(heading);
    const podium = node('div','grid grid-cols-2 gap-3 px-3');
    for(const rank of [1,2,3]) podium.append(sweetCard(entries.find(e=>e.rank===rank),rank,helpers.notify));
    $('hero').append(podium);
    const rewards = node('button','mx-auto my-5 block h-12 w-[52%] bg-[url(assets/sweet-button.png)] bg-[length:100%_100%] text-base font-bold','View rewards');
    rewards.type='button'; rewards.onclick=()=>$('rewards-dialog').showModal();
    const rewardPreview=node('section','mx-3 mt-4 rounded-2xl border border-amber-300/60 bg-rose-950/40 p-3');
    rewardPreview.id='cp-reward-preview';
    rewardPreview.append(node('h2','text-center font-bold','Rewards for this period'),node('p','py-3 text-center text-xs','Open this event from Mega Live to view rewards.'));
    $('hero').append(rewardPreview,rewards);
    for(const entry of entries){
      const row=node('article','relative my-4 flex min-h-24 items-center gap-2 bg-[url(assets/sweet-row.png)] bg-[length:100%_100%] px-5 py-4');
      const rankBadge=node('div','relative w-10 shrink-0 text-center text-xl font-bold');
      if(entry.rank<=2)rankBadge.append(art(`sweet-badge-${entry.rank}.png`,'absolute inset-0 h-full w-full object-contain'));
      rankBadge.append(node('span','relative block py-4',entry.rank)); row.append(rankBadge);
      if(entry.rank===1)row.classList.add('bg-[url(assets/sweet-purple-row.png)]');
      const pair=node('div','w-24 shrink-0'); pair.append(sweetPair(entry,helpers.notify)); row.append(pair);
      const names=node('div','min-w-0 flex-1 text-xs');
      names.append(node('p','truncate font-semibold',entry.person?.name || 'Unavailable'),node('p','truncate',entry.partner?.name || 'Unavailable'));
      row.append(names);
      $('entries').append(row);
    }
  }
  function render(type,entries,helpers){
    clearAnimations();
    theme(type);$('hero').replaceChildren();$('entries').replaceChildren();$('wheel').replaceChildren();
    if(type==='cp'){ sweetRender(entries,helpers); return; }
    const podium=node('div','relative mx-auto grid grid-cols-2 gap-x-10 px-6 pb-5');$('hero').append(podium);
    for(const e of entries.filter(e=>e.rank<=3)){
      const first=e.rank===1;const c=node('article',first?'relative col-span-2 mx-auto w-[66%]':'relative w-full');
      const artbox=node('div',first?'relative z-20 aspect-square w-full':'relative z-20 aspect-square w-full');
      const p=portrait(e.person,helpers.notify,first?'absolute left-[29%] top-[37%] h-[40%] w-[42%]':'absolute left-[23%] top-[22%] h-[52%] w-[54%]',type==='agency');
      if(type==='agency'){p.setAttribute('aria-label',`Open ${e.name} agency details`);p.disabled=!e.id;p.onclick=()=>helpers.notify({type:'ranking:open-agency',agencyPublicId:e.id});}
      artbox.append(p,art(`frame-${e.rank}.gif`,'pointer-events-none absolute inset-0 h-full w-full object-contain'));c.append(artbox);
      let card;
      if(type==='agency')card=node('div',first?'relative -mt-[23%] flex aspect-[774/554] flex-col justify-center bg-[url(assets/agency-first.png)] bg-[length:100%_100%] px-4 pt-5':'relative -mt-[23%] flex aspect-[638/438] flex-col justify-center bg-[url(assets/agency-pedestal.png)] bg-[length:100%_100%] px-2 pt-2');
      else {const backgrounds={wealth:['bg-[url(assets/wealth-card-1.png)]','bg-[url(assets/wealth-card-2.png)]','bg-[url(assets/wealth-card-3.png)]'],charm:['bg-[url(assets/charm-card-1.png)]','bg-[url(assets/charm-card-2.png)]','bg-[url(assets/charm-card-3.png)]']};card=node('div',`relative -mt-[28%] flex min-h-28 flex-col justify-end bg-[length:100%_100%] px-2 pb-6 pt-8 ${backgrounds[type === 'game' ? 'wealth' : type][e.rank-1]}`);if(type==='charm'&&e.rank>1)card.append(art(`charm-card-${e.rank}-border.png`,'pointer-events-none absolute inset-0 h-full w-full'));}
      const info=details(e,type,helpers);if(type==='agency')info.append(helpers.gap(e));else {const badges=info.lastElementChild;info.append(helpers.gap(e),badges);}card.append(info);c.append(card);podium.append(c);
    }
    for(const e of entries.filter(e=>e.rank>3)){
      const bg=type==='charm'?'bg-[url(assets/charm-ranking-row.png)]':type==='agency'?'border-b border-amber-300/70':'rounded-2xl border border-amber-300 bg-red-950/60';
      const row=node('article',`row my-2 flex min-h-24 items-center gap-2 bg-[length:100%_100%] px-4 py-3 ${bg}`);const identity=details(e,type,helpers);
      identity.className='min-w-0 flex-1 text-xs [&>button]:block [&>button]:max-w-full [&>button]:truncate';
      const total=node('div','ml-auto flex shrink-0 flex-col items-end gap-1');
      total.append(helpers.gap(e));
      row.append(node('span','text-xs',e.rank),portrait(e.person,helpers.notify,'h-12 w-12 shrink-0'),identity,total);$('entries').append(row);
    }
  }
  return Object.freeze({render,theme});
})();
