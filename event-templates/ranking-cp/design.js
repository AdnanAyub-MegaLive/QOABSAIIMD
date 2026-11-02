/* Self-contained presentation for this event bundle. No ranking or reward writes. */
window.RankingDesign = (() => {
  const $ = id => document.getElementById(id);
  const node = (tag, classes = '', text) => { const n = document.createElement(tag); n.className = classes; if (text !== undefined) n.textContent = text; return n; };
  function art(file, classes) { const n = node('img', classes); n.src = `assets/${file}`; n.alt = ''; n.draggable = false; return n; }
  function portrait(person, notify, classes = '') {
    const b = node('button', `block overflow-hidden rounded-full bg-[#10051b] ${classes}`); b.type = 'button'; b.disabled = !person?.publicId;
    b.setAttribute('aria-label', person ? `Open ${person.name}'s profile` : 'No ranked participant');
    if (person?.profileImage && /^(https?:\/\/|\/)/i.test(person.profileImage)) { const im = node('img','h-full w-full object-cover'); im.src = person.profileImage; im.alt = person.name || ''; im.onerror=()=>im.remove(); b.append(im); }
    else b.append(node('span','text-xl text-slate-300','●'));
    b.onclick = () => person?.publicId && notify({type:'ranking:open-profile',publicId:person.publicId}); return b;
  }
  function badges(person) {
    const n=node('div','flex h-5 items-center justify-center gap-1');const seen=new Set();
    for(const b of person?.ownedBadges||[]){if(seen.size===5)break;const url=b.mimeType?.startsWith('image/')?b.url:b.posterUrl;if(!url||seen.has(b.assetId||url))continue;seen.add(b.assetId||url);const im=node('img','h-4 w-4 object-contain');im.src=url;im.alt=b.name||'Badge';im.onerror=()=>im.remove();n.append(im);}return n;
  }
  function value(score) {const n=node('span','whitespace-nowrap text-[11px] font-semibold text-white');const v=BigInt(score||'0');n.textContent=`◆ ${v.toLocaleString()}`;n.title=`${v.toLocaleString()} Coins`;return n;}
  function details(e, type, helpers) {
    const n=node('div','relative z-10 mx-auto flex min-w-0 max-w-full flex-col items-center gap-0.5 px-1 text-[10px]');
    const name=node('button','max-w-full truncate font-semibold',e.name);name.type='button';
    name.onclick=()=>type==='agency'?helpers.notify({type:'ranking:open-agency',agencyPublicId:e.id}):e.person?.publicId&&helpers.notify({type:'ranking:open-profile',publicId:e.person.publicId});
    n.append(name);
    if(type==='agency')n.append(node('span','text-[9px]',`${e.id} · ${e.memberCount} hosts`));
    const levels=helpers.levels(e.person,e);levels.className='flex max-w-full flex-wrap items-center justify-center gap-1 [&_img]:max-h-4 [&_img]:max-w-10 [&_.level-tag]:relative [&_.level-tag]:inline-flex [&_.level-tag]:items-center [&_.level-tag]:justify-center [&_.level-tag]:min-w-7 [&_.level-background]:absolute [&_.level-background]:inset-0 [&_.level-background]:h-full [&_.level-background]:w-full [&_b]:relative [&_b]:z-10 [&_b]:text-[9px]';
    n.append(levels,badges(e.person),value(e.score));return n;
  }
  const themes={
    agency:{background:'bg-[url(assets/agency-background.png)]',period:'bg-[url(assets/agency-period.png)]',active:'bg-[url(assets/agency-active.png)]',board:'bg-gradient-to-br from-amber-600 to-amber-950'},
    cp:{background:'bg-[url(assets/cp-background.png)]',period:'bg-[url(assets/cp-period.png)]',active:'bg-[url(assets/cp-active.png)]',board:'bg-rose-950/20'},
    wealth:{background:'bg-[url(assets/wealth-palace.png)]',period:'bg-[url(assets/wealth-period-bar.png)]',active:'bg-[url(assets/wealth-period-active.png)]',board:'bg-gradient-to-b from-red-800 to-red-950'},
    charm:{background:'bg-[url(assets/charm-palace.png)]',period:'bg-[url(assets/charm-period-bar.png)]',active:'bg-[url(assets/charm-period-active.png)]',board:'bg-slate-900/80'},
  };
  function theme(type){
    const t=themes[type];$('ranking').className=`relative mx-auto min-h-screen max-w-[440px] overflow-hidden bg-cover bg-top pb-8 ${t.background}`;
    $('filters').className=type==='agency'?'relative z-10 mt-[52%] px-3':'relative z-10 mt-3 px-3';
    $('periods').className=`flex h-12 items-center bg-[length:100%_300%] bg-center bg-no-repeat ${t.period}`;
    for(const b of $('periods').children)b.className=`h-full min-w-0 flex-1 bg-[length:100%_100%] bg-no-repeat text-sm ${b.getAttribute('aria-selected')==='true'?t.active:''}`;
    $('board').className=`relative rounded-t-3xl border-t border-amber-400 px-2 pb-6 ${t.board}`;
    $('search').hidden=type!=='agency';
    $('timing').className=type==='cp'?'mx-auto my-4 flex w-fit items-center gap-3 rounded-full border border-amber-300 bg-purple-950/80 px-5 py-2 text-sm':'mx-auto my-1 flex w-fit items-center gap-2 rounded-full border border-yellow-400 bg-slate-950 px-3 py-1 text-xs';
    if(type==='cp')$('board').before($('timing'));else $('hero').before($('timing'));
  }
  function coupleCard(e, first, notify){
    const c=node('article',first?'relative mx-auto aspect-[986/724] w-[64%]':'relative aspect-[986/724] w-full');
    c.append(portrait(e?.person,notify,'absolute left-[20%] top-[36%] h-[25%] w-[21%]'),portrait(e?.partner,notify,'absolute left-[56%] top-[36%] h-[25%] w-[21%]'));
    c.append(art('cp-carriage.png','pointer-events-none absolute inset-0 h-full w-full'));
    c.append(node('span','absolute left-[25%] top-[13%] w-1/2 text-center text-xs font-bold text-purple-950',e?`TOP ${e.rank}`:'—'));
    if(e){const label=node('div','absolute bottom-[2%] left-[5%] flex w-[90%] flex-col items-center rounded-lg bg-purple-950/80 px-1 text-[9px]');label.append(node('span','max-w-full truncate',`${e.person?.name||'Unavailable'} & ${e.partner?.name||'Unavailable'}`),value(e.score));c.append(label);}return c;
  }
  function wheel(entries,notify){
    const w=node('div','relative mx-auto mt-5 aspect-[1380/1316] w-[86%] animate-spin [animation-duration:10s]');
    const slots=['left-[36%] top-[10%]','left-[65%] top-[30%]','left-[61%] top-[62%]','left-[36%] top-[78%]','left-[10%] top-[62%]','left-[7%] top-[30%]'];
    slots.forEach((pos,i)=>{const pair=node('div',`absolute flex h-[10%] w-[22%] gap-[12%] ${pos}`);pair.append(portrait(entries[i]?.person,notify,'h-full w-[44%]'),portrait(entries[i]?.partner,notify,'h-full w-[44%]'));w.append(pair);});
    w.append(art('cp-wheel.png','pointer-events-none absolute inset-0 h-full w-full'));return w;
  }
  function render(type,entries,helpers){
    theme(type);$('hero').replaceChildren();$('entries').replaceChildren();$('wheel').replaceChildren();
    if(type==='cp'){
      $('wheel').append(wheel(entries.slice(0,6),helpers.notify));
      if(entries.length){$('hero').append(coupleCard(entries.find(e=>e.rank===1),true,helpers.notify));const pair=node('div','grid grid-cols-2 gap-2 px-2');for(const e of entries.filter(e=>e.rank===2||e.rank===3))pair.append(coupleCard(e,false,helpers.notify));$('hero').append(pair);}
      for(const e of entries){const row=node('article','relative my-3 aspect-[1744/579] w-full bg-[url(assets/cp-row.png)] bg-[length:100%_100%] text-purple-950');
        row.append(node('span','absolute left-[5%] top-[45%] text-xs font-bold',e.rank));
        for(const [i,p]of[e.person,e.partner].entries()){const wrap=node('div',`absolute top-[24%] h-[58%] w-[18%] ${i?'right-[12%]':'left-[15%]'}`);wrap.append(portrait(p,helpers.notify,'mx-auto aspect-square w-[75%]'),art('cp-frame.png','pointer-events-none absolute left-[5%] top-[-10%] h-[88%] w-[90%]'),node('span','relative block truncate text-center text-[9px]',p?.name||'Unavailable'));row.append(wrap);}
        const mid=node('div','absolute left-[38%] top-[30%] flex w-[24%] flex-col items-center');mid.append(art('cp-heart.png','h-7 w-8 object-contain'));const s=value(e.score);s.className='text-[9px] font-bold text-purple-950';mid.append(s);row.append(mid);$('entries').append(row);
      }return;
    }
    const podium=node('div','relative mx-auto grid grid-cols-2 gap-x-10 px-6 pb-5');$('hero').append(podium);
    for(const e of entries.filter(e=>e.rank<=3)){
      const first=e.rank===1;const c=node('article',first?'relative col-span-2 mx-auto w-[66%]':'relative w-full');
      const artbox=node('div',first?'relative z-20 aspect-square w-full':'relative z-20 aspect-square w-full');
      const p=portrait(e.person,helpers.notify,first?'absolute left-[29%] top-[37%] h-[40%] w-[42%]':'absolute left-[23%] top-[22%] h-[52%] w-[54%]');
      if(type==='agency'){p.setAttribute('aria-label',`Open ${e.name} agency details`);p.disabled=!e.id;p.onclick=()=>helpers.notify({type:'ranking:open-agency',agencyPublicId:e.id});}
      artbox.append(p,art(`frame-${e.rank}.gif`,'pointer-events-none absolute inset-0 h-full w-full object-contain'));c.append(artbox);
      let card;
      if(type==='agency')card=node('div',first?'relative -mt-[23%] flex aspect-[774/554] flex-col justify-center bg-[url(assets/agency-first.png)] bg-[length:100%_100%] px-4 pt-5':'relative -mt-[23%] flex aspect-[638/438] flex-col justify-center bg-[url(assets/agency-pedestal.png)] bg-[length:100%_100%] px-2 pt-2');
      else {const backgrounds={wealth:['bg-[url(assets/wealth-card-1.png)]','bg-[url(assets/wealth-card-2.png)]','bg-[url(assets/wealth-card-3.png)]'],charm:['bg-[url(assets/charm-card-1.png)]','bg-[url(assets/charm-card-2.png)]','bg-[url(assets/charm-card-3.png)]']};card=node('div',`relative -mt-[28%] flex min-h-28 flex-col justify-end bg-[length:100%_100%] px-2 pb-6 pt-8 ${backgrounds[type][e.rank-1]}`);if(type==='charm'&&e.rank>1)card.append(art(`charm-card-${e.rank}-border.png`,'pointer-events-none absolute inset-0 h-full w-full'));}
      card.append(details(e,type,helpers));c.append(card);podium.append(c);
    }
    for(const e of entries.filter(e=>e.rank>3)){
      const bg=type==='charm'?'bg-[url(assets/charm-ranking-row.png)]':type==='agency'?'border-b border-amber-300/70':'rounded-2xl border border-amber-300 bg-red-950/60';
      const row=node('article',`my-2 flex min-h-24 items-center gap-2 bg-[length:100%_100%] px-4 py-3 ${bg}`);row.append(node('span','text-xs',e.rank),portrait(e.person,helpers.notify,'h-12 w-12 shrink-0'),details(e,type,helpers));$('entries').append(row);
    }
  }
  return Object.freeze({render,theme});
})();
