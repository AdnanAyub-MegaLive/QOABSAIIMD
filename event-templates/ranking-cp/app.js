(() => {
  'use strict';
  const $ = id => document.getElementById(id), root = $('ranking');
  const fixedTrack='cp', eventSlug='ranking-cp';
  let token = '', type = fixedTrack || 'wealth', period = 'today', entries = [], nextOffset = null, request, timer, resetAt = 0, clockOffset = 0;
  const rewardsPanel=$('reward-details');
  const labels={wealth:'Wealth',charm:'Charm',agency:'Agency',cp:'CP'};
  const scoring={wealth:'Ranked by the Coin value of gifts sent during the selected period.',charm:'Ranked by the Coin value of gifts received during the selected period.',agency:'Ranked by gifts received by hosts, attributed to their agency at the time of gift settlement.',cp:'Ranked by gifts exchanged between active CP partners since their relationship began, within the selected period.'};
  let cycleLabel = 'Cycle';
  function renderRules(){
    $('rules-title').textContent=`${labels[type]} event rules`;
    $('rule-text').textContent=`${scoring[type]} Refunded gifts are excluded. Daily periods reset at midnight UTC+7; weekly periods start on Monday; cycle periods follow the server-configured calendar month or 1st–15th / 16th–month-end in UTC+7. Equal scores use public ID order.`;
    $('award-rules').textContent=`${type==='agency'?'Rewards go to the agency owner.':type==='cp'?'Both CP partners receive the full configured reward.':'Rewards go to the ranked user.'} Rewards follow the admin settings for this event and period and are processed after the period closes. No rewards apply before activation. Awards requiring review may be delayed. Profile blocks may hide entries; awards use global ranking positions.`;
    $('rewards-title').textContent=`${labels[type]} · ${{today:'Daily',week:'Weekly',month:cycleLabel}[period]} rewards`;
  }
  function renderRewards(data){
    rewardsPanel.replaceChildren();
    if(!fixedTrack){rewardsPanel.append(el('p','','Rewards are configured in the separate Wealth, Charm, Agency and CP events. Open the corresponding event to view its rewards.'));return;}
    const show=(policy,title)=>{
      rewardsPanel.append(el('h3','',title));
      if(!policy?.enabled){rewardsPanel.append(el('p','','Automatic rewards are not enabled for this period.'));return;}
      rewardsPanel.append(el('p','',`Applies from ${new Date(policy.effectiveFrom).toLocaleString('en-US', { timeZone: 'Asia/Bangkok', timeZoneName: 'shortOffset' })}`));
      if(!policy.rewards?.length){rewardsPanel.append(el('p','','No rewards configured for this period.'));return;}
      for(const r of policy.rewards){
        const card=el('article','reward-card');card.append(el('h4','reward-rank',`TOP ${r.rank}`));
        const items=el('div','reward-items');
        const add=(name,detail,media)=>{const item=el('div','reward-item');if(media)item.append(image(media,'reward-art'));item.append(el('strong','',name));if(detail)item.append(el('span','',detail));items.append(item);};
        if(r.coins&&r.coins!=='0')add(`${r.coins} Coins`,'');
        if(r.diamonds&&r.diamonds!=='0')add(`${r.diamonds} Diamonds`,'');
        for(const p of r.props||[])add(p.name,`${p.days} days`,p.posterUrl||(p.mimeType?.startsWith('image/')?p.url:null));
        if(r.vip)add(r.vip.name,`${r.vip.days} days of VIP`);
        card.append(items);rewardsPanel.append(card);
      }
    };
    show(data.rewardPolicy,'Current period');if(data.upcomingRewardPolicy)show(data.upcomingRewardPolicy,'Next period settings');
    const preview=$('cp-reward-preview');
    if(preview){
      preview.replaceChildren(el('h2','text-center font-bold','Rewards for this period'));
      const cards=el('div','mt-3 grid grid-cols-3 gap-2');
      for(const reward of data.rewardPolicy?.enabled ? data.rewardPolicy.rewards || [] : []){
        const card=el('div','flex min-h-24 flex-col items-center justify-center rounded-xl border border-amber-300 bg-pink-950/70 p-2 text-center text-xs');
        card.append(el('strong','',`TOP ${reward.rank}`));
        if(reward.coins && reward.coins!=='0')card.append(el('p','',`${reward.coins} Coins`));
        if(reward.diamonds && reward.diamonds!=='0')card.append(el('p','',`${reward.diamonds} Diamonds`));
        for(const prop of reward.props || [])card.append(el('p','',`${prop.name} · ${prop.days} days`));
        if(reward.vip)card.append(el('p','',`${reward.vip.name} · ${reward.vip.days} days`));
        cards.append(card);
      }
      if(cards.children.length)preview.append(cards);
      else preview.append(el('p','py-3 text-center text-xs','No rewards configured for this period.'));
    }


  }
  const notify = data => window.ReactNativeWebView?.postMessage(JSON.stringify(data));
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const image = (url, cls, fallback = false) => { const n = el('img', cls); n.alt = ''; n.loading = 'lazy'; const safe = typeof url === 'string' && (/^https?:\/\//i.test(url) || url.startsWith('/')); n.src = safe ? url : 'assets/dceee.svg'; if (!safe && !fallback) n.hidden = true; n.addEventListener('error', () => { n.hidden = true; }, { once: true }); return n; };
  function rowAvatar(person) {
    const n=el('div','ranking-avatar');n.append(image(person?.profileImage,'portrait',true));
    if(window.RankingFrame){window.RankingFrame(n,person);return n;}
    const url=person?.frameMimeType && !person.frameMimeType.startsWith('image/') ? person.framePosterUrl : person?.frameUrl;
    if(url)n.append(image(url,'ranking-avatar-frame'));
    return n;
  }
  function levels(person) {
    const n = el('div', 'levels');
    for (const track of ['user', 'charm']) {
      const level = person?.[`${track}Level`] ?? 0;
      const label = track === 'user' ? 'Wealth' : 'Charm';
      const tag = el('span', `level-tag level-tag-${track}`);
      tag.setAttribute('aria-label', `${label} level ${level}`);
      tag.title = `${label} level ${level}`;
      const prefix = `${track}LevelBackground`;
      const mime = person?.[`${prefix}MimeType`];
      const url = mime && !mime.startsWith('image/')
        ? person?.[`${prefix}PosterUrl`] : person?.[`${prefix}Url`];
      if (url) tag.append(image(url, 'level-background'));
      tag.append(el('b', 'level-value', `${track === 'user' ? 'W' : 'C'} ${level}`));
      n.append(tag);
    }
    if (person?.badgeUrl) n.append(image(person.badgeMimeType === 'application/svga' ? person.badgePosterUrl : person.badgeUrl));
    return n;
  }
  function identity(person, equipped = false) {
    const n = el('div');
    n.append(equipped ? rowAvatar(person) : image(person?.profileImage, 'portrait', true), el('span', 'name', person?.name || 'Unavailable'));
    return n;
  }
  function entryName(entry) { return el('span', 'name entry-name', entry.name); }
  function entryContainer(entry, cls) {
    const n = el(type === 'agency' ? 'button' : 'article', cls);
    if (type === 'agency') {
      n.type = 'button';
      n.disabled = !entry.id;
      n.setAttribute('aria-label', `Open ${entry.name} agency details`);
      n.onclick = () => entry.id && notify({ type: 'ranking:open-agency', agencyPublicId: entry.id });
    }
    return n;
  }
  function render() {
    if(window.RankingDesign){window.RankingDesign.render(type,entries,{notify,levels});$('more').hidden=nextOffset===null;return;}
    $('entries').replaceChildren(); $('hero').replaceChildren();
    if (type === 'agency') $('hero').append(image('/event/ranking-cp/assets/9b423.png', 'agency-logo'));
    else if (entries[0] && type !== 'cp') { const h = el('div', 'featured'); h.append(image(entries[0].person?.profileImage, 'portrait', true), image('/event/ranking-cp/assets/b2851.png', 'hero-frame'), entryName(entries[0]), levels(entries[0].person)); $('hero').append(h); }
    else if (entries[0]) { const h = el('div', 'couple'); for (const p of [entries[0].person, entries[0].partner]) { const n = el('div', 'person'); n.append(identity(p),image('/event/ranking-cp/assets/f8573.png','cp-frame'), levels(p)); h.append(n); } $('hero').append(h); }
    let podium;
    if (type !== 'cp' && entries.some(e => e.rank <= 3)) { podium = el('div', 'podium'); $('entries').append(podium); }
    entries.forEach(e => {
      if (type === 'cp') { const row = el('article', 'row cp-row'), pair = el('div', 'pair'); row.append(el('span', 'rank', e.rank)); for (const [i,p] of [e.person,e.partner].entries()) { if (i) pair.append(image('/event/ranking-cp/assets/4d0b8.png','heart')); const n = el('div','identity'); n.append(identity(p,e.rank>3),levels(p)); pair.append(n); } row.append(pair); const value = el('div'); value.append(el('p','meta',`LV ${e.level}`)); row.append(value); $('entries').append(row); return; }
      if (e.rank <= 3 && podium) { const n = entryContainer(e,'person'), art = el('div','art'); art.append(image(e.person?.profileImage,'portrait',true),image(`/event/ranking-cp/assets/${['e0e12','526f3','ad116'][e.rank-1]}.png`,'frame')); n.append(art,entryName(e),levels(e.person)); if(type==='agency')n.append(el('div','meta',`${e.memberCount} hosts · ${e.id}`),image(`/event/ranking-cp/assets/${['4fa18','86ac8','52dd6'][e.rank-1]}.png`,'trophy')); podium.append(n); }
      else { const n = entryContainer(e,'row'), details=el('div','identity'); details.append(entryName(e),levels(e.person)); n.append(el('span','rank',e.rank),(type==='agency'?image(e.person?.profileImage,'portrait',true):rowAvatar(e.person)),details); $('entries').append(n); }
    }); $('more').hidden = nextOffset === null;
  }
  async function load(append = false) {
    renderRules();
    if(!append)rewardsPanel.replaceChildren(el('p','',token?'Loading rewards…':'Open this event from Mega Live to view rewards.'));
    if (!token) return; request?.abort(); const current = new AbortController(); request = current;
    $('retry').hidden = true; $('more').hidden = true; $('status').hidden = false; $('status').textContent = 'Loading rankings…';
    try { const params = new URLSearchParams({event:eventSlug,type,period,offset:String(append ? nextOffset || 0 : 0),q:type==='agency'?$('search').value.trim():''}); const response = await fetch(`/api/v1/events/rankings?${params}`,{headers:{Authorization:`Bearer ${token}`},signal:current.signal,cache:'no-store'}); const body = await response.json(); if(!response.ok) { if(response.status===401){token='';notify({type:'ranking:session-required'});} throw Error(body.error?.message || 'Unable to load rankings.'); } if(request!==current)return;const data=body.data; cycleLabel=data.cycle?.days===15?'15-day cycle':data.cycle?.days===30?'Monthly':'Cycle';filters(); entries=append?[...entries,...data.entries]:data.entries; nextOffset=data.nextOffset; resetAt=Date.parse(data.resetsAt);clockOffset=Date.parse(data.generatedAt)-Date.now(); render();renderRewards(data); const viewer = data.viewer;
      $('status').hidden = !viewer && entries.length > 0;
      $('status').textContent = !viewer ? 'No eligible gifts in this period yet.'
        : viewer.rank === 1 ? 'You’re #1'
        : `You’re #${viewer.rank} · ${BigInt(viewer.gap).toLocaleString()} ${data.scoreUnit} behind #${viewer.rank - 1}`; }
    catch(error){if(error.name==='AbortError')return;if(request!==current)return;rewardsPanel.replaceChildren(el('p','','Rewards could not be loaded. Please retry.'));$('status').textContent=error.message;$('retry').hidden=!token;}
  }
  function tabs(id, values, selected, change) { $(id).replaceChildren(); if(id==='tracks'&&fixedTrack){$(id).append(el('h1','',`${fixedTrack.toUpperCase()} Rankings`));return;} for(const [value,label] of values){const button=el('button','',label);button.setAttribute('aria-selected',String(value===selected));button.onclick=()=>change(value);$(id).append(button);} }
  function filters(){
    renderRules();
    tabs('tracks',[['wealth','Wealth'],['charm','Charm'],['agency','Agency'],['cp','CP']],type,v=>{type=v;root.dataset.theme=v;entries=[];nextOffset=null;resetAt=0;render();filters();load();});
    if(window.RankingDesign && fixedTrack){
      const nav=el('div','flex w-full justify-around gap-2');
      for(const [key,label] of Object.entries(labels)){const link=el('a',key===type?'text-yellow-300 underline underline-offset-8':'text-white',label);link.href=`/event/ranking-${key}/index.html`;if(key===type)link.setAttribute('aria-current','page');nav.append(link);}
      $('tracks').replaceChildren(nav);
    }else if(window.RankingDesign){for(const b of $('tracks').children)b.className=b.getAttribute('aria-selected')==='true'?'text-yellow-300 underline underline-offset-8':'text-white';}
    tabs('periods',[['today','Daily'],['week','Weekly'],['month',cycleLabel]],period,v=>{period=v;entries=[];nextOffset=null;resetAt=0;render();filters();load();});
    $('heading').textContent={today:'Today',week:'This week',month:cycleLabel}[period];$('search').hidden=type!=='agency';
    if(window.RankingDesign)window.RankingDesign.theme(type);
  }
  window.MegaRankings=Object.freeze({setSession(value){if(typeof value!=='string'||!value||value.length>8192)return;token=value;load();},clearSession(){token='';request?.abort();request=null;entries=[];render();rewardsPanel.replaceChildren(el('p','','Open this event from Mega Live to view rewards.'));$('status').hidden=false;$('status').textContent='Open this event from Mega Live to view rankings.';}});
  $('search').oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>load(),350);};$('more').onclick=()=>load(true);$('retry').onclick=()=>load();$('back').onclick=()=>notify({type:'ranking:close'});$('rules').onclick=()=>$('rules-dialog').showModal();$('close-rules').onclick=()=>$('rules-dialog').close();$('rewards').onclick=()=>$('rewards-dialog').showModal();$('close-rewards').onclick=()=>$('rewards-dialog').close();
  setInterval(()=>{if(!resetAt)return;const seconds=Math.max(0,Math.floor((resetAt-Date.now()-clockOffset)/1000));$('countdown').textContent=`${Math.floor(seconds/86400)?Math.floor(seconds/86400)+'d ':''}${String(Math.floor(seconds/3600)%24).padStart(2,'0')} : ${String(Math.floor(seconds/60)%60).padStart(2,'0')} : ${String(seconds%60).padStart(2,'0')}`;if(!seconds){resetAt=0;load();}},1000);
  rewardsPanel.replaceChildren(el('p','','Open this event from Mega Live to view rewards.'));
  render();filters();notify({type:'ranking:ready',version:1});
})();
