import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';

class Element {
  constructor(tag) { this.tag=tag;this.children=[];this.dataset={};this.attributes={};this.style={setProperty(){}}; }
  append(...nodes) { for(const n of nodes){n.parentElement=this;this.children.push(n);} }
  prepend(n) { n.parentElement=this;this.children.unshift(n); }
  replaceChildren(...nodes) { this.children=[];this.append(...nodes); }
  setAttribute(k,v) { this.attributes[k]=v; }
  addEventListener(type,listener) { (this.listeners??={})[type]=listener; }
  showModal() { this.open=true; }
  close() { this.open=false; }
  get firstElementChild() { return this.children[0]; }
  querySelectorAll(selector) { return descendants(this).slice(1).filter(n=>matches(n,selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  cloneNode(deep) {
    const copy=new Element(this.tag);
    for(const key of ['id','className','hidden','src','alt','textContent','type'])if(key in this)copy[key]=this[key];
    Object.assign(copy.dataset,this.dataset);Object.assign(copy.attributes,this.attributes);
    if(deep)copy.append(...this.children.map(n=>n.cloneNode(true)));
    return copy;
  }
}
const descendants=n=>[n,...n.children.flatMap(descendants)];
const dataKey=name=>name.slice(5).replace(/-(\w)/g,(_,c)=>c.toUpperCase());
function matches(node,selector) {
  const data=/^\[(data-[\w-]+)(?:="([^"]*)")?\]$/.exec(selector);
  if(data){const value=node.dataset[dataKey(data[1])];return data[2]===undefined?value!==undefined:value===data[2];}
  if(selector.startsWith('#'))return node.id===selector.slice(1);
  if(selector.startsWith('.'))return (node.className||'').split(' ').includes(selector.slice(1));
  return node.tag===selector;
}
const voidTags=new Set(['img','input','meta','link','br','hr','source']);
function parseHtml(html) {
  const root=new Element('document'),ids=new Map();let current=root;
  const body=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<!doctype[^>]*>/i,'');
  for(const [,closing,tag,attrs,text] of body.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*\/?>|([^<]+)/g)){
    if(text!==undefined){const value=text.trim();if(value&&!current.children.length)current.textContent=(current.textContent??'')+value;continue;}
    const name=tag.toLowerCase();
    if(closing){if(current.tag===name)current=current.owner??current.parentElement;continue;}
    const node=new Element(name);
    for(const [,key,value] of attrs.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)){
      if(key==='id'){node.id=value;ids.set(value,node);}
      else if(key==='class')node.className=value;
      else if(key==='hidden')node.hidden=true;
      else if(key.startsWith('data-'))node.dataset[dataKey(key)]=value??'';
      else if(key==='src'||key==='alt'||key==='type')node[key]=value;
      else node.attributes[key]=value??'';
    }
    current.append(node);
    if(name==='template'){node.content=new Element('fragment');node.content.owner=node;current=node.content;}
    else if(!voidTags.has(name))current=node;
  }
  return {root,ids};
}
async function fixture(track, rewardPolicy=null, pathname='', template='rankings', viewer=null) {
  const messages=[],requests=[];let modalObserver;
  const {root,ids:nodes}=parseHtml(readFileSync(`event-templates/${template}/index.html`,'utf8'));
  const get=id=>{if(!nodes.has(id)){const node=new Element('div');node.id=id;nodes.set(id,node);}return nodes.get(id);};
  get('search').value='';
  if(track){get('ranking').dataset.track=track;get('ranking').dataset.event=`ranking-${track}`;}
  const window={location:{pathname},ReactNativeWebView:{postMessage:value=>messages.push(JSON.parse(value))}};
  vm.runInNewContext(readFileSync(`event-templates/${template}/app.js`,'utf8'),{
    window,document:{getElementById:get,createElement:tag=>new Element(tag),querySelectorAll:selector=>root.querySelectorAll(selector)},
    MutationObserver:class{constructor(callback){modalObserver=callback;}observe(){}},
    URLSearchParams,AbortController,setInterval:()=>0,setTimeout,clearTimeout,
    fetch:async url=>{requests.push(url);const type=new URL(url,'https://example.test').searchParams.get('type');return {ok:true,json:async()=>({data:{viewer,rewardPolicy:typeof rewardPolicy==='function'?await rewardPolicy(type,url):rewardPolicy,entries:[1,2,3,4].map(rank=>({id:type==='agency'?`AGN-${rank}`:`USR-${rank}`,name:`Entry ${rank}`,rank,gap:rank===1?null:'2700',agencyLevel:6,agencyLevelBackgroundUrl:'https://cdn.example/agency.png',agencyLevelBackgroundMimeType:'image/png',score:'100',person:{publicId:`USR-${rank}`,name:`Person ${rank}`,frameUrl:'https://cdn.example/frame.svga',frameMimeType:'application/svga',framePosterUrl:'https://cdn.example/frame.png',vip:rank===1?{level:3,artwork:{mimeType:'image/gif',url:'https://cdn.example/vip-3.gif'}}:null,userLevel:42,charmLevel:17,ownedBadges:Array.from({length:7},(_,i)=>({assetId:`AST-${i}`,name:`Badge ${i}`,mimeType:'image/gif',url:`https://cdn.example/badge-${i}.gif`})),userLevelBackgroundUrl:'https://cdn.example/wealth.png',userLevelBackgroundMimeType:'image/png',charmLevelBackgroundUrl:'https://cdn.example/charm.svga',charmLevelBackgroundMimeType:'application/svga',charmLevelBackgroundPosterUrl:'https://cdn.example/charm.png'},partner:{publicId:`TLN-${rank}`,name:'Partner'}})),nextOffset:null,generatedAt:new Date().toISOString(),resetsAt:new Date(Date.now()+60000).toISOString()}})};},
  });
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  window.MegaRankings.setSession('test-session');await flush();
  const board=()=>descendants(get('ranking')).filter(n=>!n.hidden||n.className==='ranking-gap');
  return {get,messages,flush,requests,board,refreshRewards:()=>modalObserver()};
}
function wrapperFixture() {
  const messages=[];
  const {root,ids}=parseHtml(readFileSync('event-templates/rankings/index.html','utf8'));
  const head=new Element('head'),sessions=[];
  const child={document:{getElementById:id=>descendants(head).find(n=>n.id===id)??null,createElement:tag=>new Element(tag),head},MegaRankings:{setSession:value=>sessions.push(value),clearSession(){}}};
  const frame=ids.get('ranking-page');frame.contentWindow=child;
  const window={location:{href:'https://example.test/event/rankings/index.html'},ReactNativeWebView:{postMessage:value=>messages.push(JSON.parse(value))}};
  vm.runInNewContext(readFileSync('event-templates/rankings/app.js','utf8'),{
    window,URL,document:{getElementById:id=>ids.get(id)??null,querySelectorAll:selector=>root.querySelectorAll(selector)},
  });
  return {frame,child,head,messages,sessions,tabs:root.querySelectorAll('[data-track]')};
}
describe('all rankings wrapper',()=>{
  it('switches between the standalone category pages',()=>{
    const {frame,tabs,messages}=wrapperFixture();
    expect(messages).toEqual([{type:'ranking:ready',version:1}]);
    expect(tabs.map(n=>n.textContent)).toEqual(['Wealth','Charm','Agency','CP']);
    expect(frame.src).toBe('/event/ranking-wealth/index.html');
    tabs[1].listeners.click();
    expect(frame.src).toBe('/event/ranking-charm/index.html');
    expect(frame.title).toBe('Charm Ranking');
    expect(tabs.map(n=>n.attributes['aria-selected'])).toEqual(['false','true','false','false']);
  });
  it('passes the session to the embedded page, hides its own tabs and forwards its native messages except ready',()=>{
    const {frame,child,head,messages,sessions}=wrapperFixture();
        frame.listeners.load();
    expect(descendants(head).find(n=>n.id==='all-rankings-navigation').textContent).toContain('#tracks { display:none !important; }');
    messages.length=0;
    child.ReactNativeWebView.postMessage(JSON.stringify({type:'ranking:ready',version:1}));
    child.ReactNativeWebView.postMessage(JSON.stringify({type:'ranking:close'}));
    expect(messages).toEqual([{type:'ranking:close'}]);
    expect(sessions).toEqual([]);
  });
});
describe('ranking native navigation',()=>{
  it('discards rewards from a previous period when the modal is refreshed',async()=>{
    let release;
    const policy=url=>({enabled:true,effectiveFrom:'2026-11-09T00:00:00Z',rewards:[{rank:1,coins:new URL(url,'https://example.test').searchParams.get('period')==='week'?'222':'111',props:[]}]});
    const {get,flush,refreshRewards}=await fixture('wealth',async(type,url)=>{
      if(url.includes('ranking-rewards?')&&url.includes('period=today'))await new Promise(resolve=>{release=resolve;});
      return policy(url);
    },'','ranking-wealth');
    get('rewards').onclick();refreshRewards();await flush();
    get('periods').children[1].onclick();await flush();
    refreshRewards();await flush();
    release();await flush();
    const text=descendants(get('reward-details')).map(n=>n.textContent);
    expect(text).toContain('Wealth · TOP 1');
    expect(text).toContain('222 Coins');
    expect(text).not.toContain('111 Coins');
  });

  it('refreshes the modal from the public rewards endpoint and shows inactive configured prizes',async()=>{
    const {get,requests,refreshRewards,flush}=await fixture('wealth',{enabled:false,effectiveFrom:'2026-11-13T00:00:00Z',rewards:[{rank:2,coins:'700',props:[]}]},'','ranking-wealth');
    get('rewards').onclick();refreshRewards();await flush();
    expect(requests.at(-1)).toContain('/api/v1/events/ranking-rewards?');
    expect(descendants(get('reward-details')).some(n=>n.textContent==='700 Coins')).toBe(true);
    expect(descendants(get('reward-details')).some(n=>n.textContent?.includes('inactive'))).toBe(true);
  });
  it.each(['wealth','charm','agency','cp','game'])('runs independent %s source and local assets',async track=>{
    const {requests,get}=await fixture(null,null,'',`ranking-${track}`);
    expect(requests[0]).toContain(`event=ranking-${track}`);
    expect(requests[0]).toContain(`type=${track}`);
    expect(get('tracks').children).toHaveLength(1);
    expect(readFileSync(`event-templates/ranking-${track}/app.js`,'utf8')).not.toContain('/event/rankings/');
    expect(readFileSync(`event-templates/ranking-${track}/index.html`,'utf8')).toContain(`data-track="${track}"`);
  });
  it.each(['wealth','charm','agency','cp','game'])('locks the dedicated %s page even when served from another URL',async track=>{
    const {get,requests}=await fixture(null,null,'/event/rankings/_v/3/index.html',`ranking-${track}`);
    expect(get('tracks').children).toHaveLength(1);
    expect(requests[0]).toContain(`type=${track}`);
    expect(requests[0]).toContain(`event=ranking-${track}`);
  });
  it('overlays actual levels on uploaded artwork and uses posters for non-image media',async()=>{
    const {get}=await fixture('wealth',null,'','ranking-wealth');
    const tags=descendants(get('hero')).filter(n=>n.className?.startsWith('level-tag '));
    expect(tags).toHaveLength(1);
    expect(tags.map(n=>n.children.find(c=>c.className==='level-value').textContent)).toEqual(['42']);
    expect(tags.map(n=>n.children.find(c=>c.className==='level-background').src)).toEqual(['https://cdn.example/wealth.png']);
  });
  it('shows configured rewards as TOP cards with prop artwork',async()=>{
    const {get}=await fixture('wealth',{enabled:true,effectiveFrom:'2026-10-19T00:00:00Z',rewards:[{rank:1,coins:'500',diamonds:'20',props:[{name:'Gold frame',days:7,url:'https://media.example/frame.gif',mimeType:'image/gif'}],vip:{name:'VIP 3',days:2}}]},'','ranking-wealth');
    const nodes=descendants(get('reward-details'));
    get('rewards').onclick();expect(get('rewards-dialog').open).toBe(true);
    get('close-rewards').onclick();expect(get('rewards-dialog').open).toBe(false);
    expect(nodes.some(n=>n.className==='reward-rank'&&n.textContent==='Wealth · TOP 1')).toBe(true);
    expect(nodes.some(n=>n.textContent==='500 Coins')).toBe(true);
    expect(nodes.some(n=>n.textContent==='VIP 3')).toBe(true);
    expect(nodes.some(n=>n.className==='reward-art'&&n.src==='https://media.example/frame.gif')).toBe(true);
  });
  it.each(['wealth','charm','agency','cp','game'])('keeps the separate %s event fixed when switching periods',async track=>{
    const {get,requests,flush}=await fixture(track,null,'',`ranking-${track}`);
    get('periods').children[1].onclick();await flush();
    expect(get('tracks').children).toHaveLength(1);
    for(const url of requests){const p=new URL(url,'https://example.test').searchParams;expect(p.get('type')).toBe(track);expect(p.get('event')).toBe(`ranking-${track}`);}
    expect(new URL(requests.at(-1),'https://example.test').searchParams.get('period')).toBe('week');
  });
  it.each(['wealth','charm'])('%s names are static on the podium and list',async track=>{
    const {board}=await fixture(track,null,'',`ranking-${track}`);
    const names=board().filter(n=>n.className==='name entry-name');
    expect(names).toHaveLength(4);
    for(const name of names){expect(name.tag).toBe('span');expect(name.onclick).toBeUndefined();}
  });
  it('agency cards send agency IDs rather than owner IDs',async()=>{
    const {get,messages}=await fixture('agency',null,'','ranking-agency');
    const buttons=descendants(get('entries')).filter(n=>n.tag==='button');expect(buttons).toHaveLength(4);
    for(const [i,button] of buttons.entries()){messages.length=0;button.onclick();expect(messages).toEqual([{type:'ranking:open-agency',agencyPublicId:`AGN-${i+1}`}]);}
  });
  it.each([['wealth','Wealth event rules','gifts sent','Rewards go to the ranked user'],['charm','Charm event rules','gifts received','Rewards go to the ranked user'],['cp','CP event rules','active CP partners','Both CP partners'],['agency','Agency event rules','attributed to their agency','agency owner']])('shows %s event rules in a separate rules dialog',async(track,title,rule,award)=>{
    const {get}=await fixture(track,null,'',`ranking-${track}`);
    get('rules').onclick();expect(get('rules-dialog').open).toBe(true);
    expect(get('rules-title').textContent).toBe(title);
    expect(get('rule-text').textContent).toContain(rule);
    expect(get('award-rules').textContent).toContain(award);
    get('close-rules').onclick();expect(get('rules-dialog').open).toBe(false);
  });
  it.each(['wealth','charm'])('uses the rank artwork podium frames on the standalone %s page',async track=>{
    const {board,get}=await fixture(track,null,'','ranking-' + track);
    expect(board().filter(n=>n.className==='frame').map(n=>n.src)).toEqual(['assets/top-rank-1.webp','assets/top-rank-2.webp','assets/top-rank-3.webp']);
    expect(get('entries').children.filter(n=>n.className==='row')).toHaveLength(1);
  });
  it.each(['wealth','charm'])('uses portal level backgrounds on the %s podium and list',async track=>{
    const {get}=await fixture(track,null,'','ranking-' + track);
    for(const container of ['hero','entries']){
      const tags=descendants(get(container)).filter(n=>n.className?.startsWith('level-tag '));
      expect(tags.length).toBeGreaterThan(0);
      for(const tag of tags){
        expect(tag.attributes['data-artwork']).toBe('true');
        expect(tag.children.find(n=>n.className==='level-background').src).toBe(
          tag.className.endsWith('user')?'https://cdn.example/wealth.png':'https://cdn.example/charm.png');
      }
    }
  });
  it.each(['wealth','charm'])('caps each %s ranking identity at five owned badges',async track=>{
    const {board}=await fixture(track,null,'','ranking-' + track);
    const strips=board().filter(n=>n.className==='owned-badges');
    expect(strips).toHaveLength(4);
    for(const strip of strips){
      expect(strip.children).toHaveLength(5);
      expect(strip.children[0].src).toBe('https://cdn.example/badge-0.gif');
    }
  });
  it.each(['wealth','charm','agency'])('shows only the relevant %s level and active VIP on all positions',async track=>{
    const {board}=await fixture(track,null,'',`ranking-${track}`);
    const nodes=board();
    const tags=nodes.filter(n=>n.className?.startsWith('level-tag '));
    expect(tags).toHaveLength(4);
    expect(tags.map(n=>n.children.find(c=>c.className==='level-value').textContent)).toEqual(Array(4).fill({wealth:'42',charm:'17',agency:'6'}[track]));
    expect(nodes.filter(n=>n.className==='vip-value').map(n=>n.textContent)).toEqual(track==='agency'?[]:['VIP 3']);
    if(track!=='agency'){
      expect(nodes.filter(n=>n.className==='public-id')).toHaveLength(0);
      expect(nodes.find(n=>n.className==='name entry-name').onclick).toBeUndefined();
    }
  });
  it.each(['wealth','charm','agency','cp','game','weekly-star'])('preserves the close message on the %s page',async track=>{const {get,messages}=await fixture(null,null,'',`ranking-${track}`);messages.length=0;get('back').onclick();expect(messages).toEqual([{type:'ranking:close'}]);});
});

it('Game podium and list hide badges, totals, IDs and profile links',async()=>{
 const {get,messages}=await fixture(null,null,'','ranking-game');
 const nodes=[...descendants(get('hero')),...descendants(get('entries'))];
 expect(nodes.filter(n=>n.className==='owned-badge'||n.className==='owned-badges'||n.className==='vip-tag')).toHaveLength(0);
 expect(nodes.filter(n=>n.className==='public-id'||n.className==='score')).toHaveLength(0);
 expect(nodes.filter(n=>n.className==='name entry-name')).toHaveLength(4);
 expect(nodes.filter(n=>n.className==='name entry-name').every(n=>n.onclick===undefined)).toBe(true);
 expect(nodes.filter(n=>n.tag==='button')).toHaveLength(0);
 expect(messages.filter(m=>m.type==='ranking:open-user')).toHaveLength(0);
 expect(get('rule-text').textContent).toContain('Coins wagered in settled games');
});

it.each(['wealth','charm','game'])('places %s chase gaps on podium and rows without showing the leader total',async track=>{
 const {get,board}=await fixture(null,null,'',`ranking-${track}`);
 const gaps=board().filter(n=>n.className==='ranking-gap');
 expect(gaps).toHaveLength(4);expect(gaps[0].hidden).toBe(true);expect(gaps.filter(n=>n.hidden)).toHaveLength(1);
 expect(gaps.slice(1).map(n=>n.children.find(c=>c.className==='gap-value').textContent)).toEqual(['2.7K','2.7K','2.7K']);
 expect(descendants(get('entries')).find(n=>n.className==='gap-value').textContent).toBe('2.7K');
 expect(get('board').children.some(n=>n.className==='ranking-sheet-handle')).toBe(false);
});
it('shows numeric agency IDs with no host count or owner VIP',async()=>{
 const {get}=await fixture(null,null,'','ranking-agency');
 const nodes=[...descendants(get('hero')),...descendants(get('entries'))];
 expect(nodes.filter(n=>n.className==='meta').map(n=>n.textContent)).toEqual(['1','2','3','4']);
 expect(nodes.some(n=>n.className==='vip-tag'||n.className==='owned-badges')).toBe(false);
});

it.each(['wealth','charm'])('renders a leader own total without chase arrows for %s',async track=>{
 const {get}=await fixture(track,null,'',`ranking-${track}`,{rank:1,total:'123456',gap:null});
 const leader=descendants(get('hero')).find(n=>n.className==='ranking-gap'&&!n.hidden);
 expect(leader.title).toContain('total: 123,456');
 expect(leader.children.some(n=>n.className==='gap-arrows')).toBe(false);
 expect(leader.children.find(n=>n.className==='gap-value').textContent).toBe('123.4K');
});

it.each(['ranking-wealth','ranking-charm','ranking-game','ranking-cp','ranking-weekly-star'])('%s shows equipped frames below the podium',async template=>{
  const {get}=await fixture(null,null,'',template);
  const rows=descendants(get('entries'));
  expect(rows.some(n=>n.className==='ranking-avatar-frame' && n.src==='https://cdn.example/frame.png')).toBe(true);
});
