import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';

class Element {
  constructor(tag) { this.tag=tag;this.children=[];this.dataset={};this.attributes={}; }
  append(...nodes) { for(const n of nodes){n.parentElement=this;this.children.push(n);} }
  prepend(n) { n.parentElement=this;this.children.unshift(n); }
  replaceChildren(...nodes) { this.children=[];this.append(...nodes); }
  setAttribute(k,v) { this.attributes[k]=v; }
  addEventListener() {}
  showModal() { this.open=true; }
  close() { this.open=false; }
}
const descendants=n=>[n,...n.children.flatMap(descendants)];
async function fixture(track, rewardPolicy=null, pathname='', template='rankings') {
  const nodes=new Map(),messages=[],requests=[];
  const get=id=>{if(!nodes.has(id))nodes.set(id,new Element('div'));return nodes.get(id);};
  get('search').value='';get('heading').parentElement=new Element('div');
  if(track){get('ranking').dataset.track=track;get('ranking').dataset.event=`ranking-${track}`;}
  const window={location:{pathname},ReactNativeWebView:{postMessage:value=>messages.push(JSON.parse(value))}};
  vm.runInNewContext(readFileSync(`event-templates/${template}/app.js`,'utf8'),{
    window,document:{getElementById:get,createElement:tag=>new Element(tag)},
    URLSearchParams,AbortController,setInterval:()=>0,setTimeout,clearTimeout,
    fetch:async url=>{requests.push(url);const type=new URL(url,'https://example.test').searchParams.get('type');return {ok:true,json:async()=>({data:{rewardPolicy,entries:[1,2,3,4].map(rank=>({id:type==='agency'?`AGN-${rank}`:`USR-${rank}`,name:`Entry ${rank}`,rank,score:'100',person:{publicId:`USR-${rank}`,name:`Person ${rank}`,userLevel:42,charmLevel:17,userLevelBackgroundUrl:'https://cdn.example/wealth.png',userLevelBackgroundMimeType:'image/png',charmLevelBackgroundUrl:'https://cdn.example/charm.svga',charmLevelBackgroundMimeType:'application/svga',charmLevelBackgroundPosterUrl:'https://cdn.example/charm.png'},partner:{publicId:`TLN-${rank}`,name:'Partner'}})),nextOffset:null,generatedAt:new Date().toISOString(),resetsAt:new Date(Date.now()+60000).toISOString()}})};},
  });
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  window.MegaRankings.setSession('test-session');await flush();
  return {get,messages,flush,requests};
}
describe('ranking native navigation',()=>{
  it.each(['wealth','charm','agency','cp'])('runs independent %s source and local assets',async track=>{
    const {requests,get}=await fixture(null,null,'',`ranking-${track}`);
    expect(requests[0]).toContain(`event=ranking-${track}`);
    expect(requests[0]).toContain(`type=${track}`);
    expect(get('tracks').children).toHaveLength(1);
    expect(readFileSync(`event-templates/ranking-${track}/app.js`,'utf8')).not.toContain('/event/rankings/');
    expect(readFileSync(`event-templates/ranking-${track}/index.html`,'utf8')).toContain(`data-track="${track}"`);
  });
  it.each(['wealth','charm','agency','cp'])('locks a dedicated %s URL even with a shared template',async track=>{
    const {get,requests}=await fixture(null,null,`/event/ranking-${track}/_v/3/index.html`);
    expect(get('tracks').children).toHaveLength(1);
    expect(requests[0]).toContain(`type=${track}`);
    expect(requests[0]).toContain(`event=ranking-${track}`);
  });
  it('overlays actual levels on uploaded artwork and uses posters for non-image media',async()=>{
    const {get}=await fixture('wealth');
    const tags=descendants(get('hero')).filter(n=>n.className?.startsWith('level-tag '));
    expect(tags).toHaveLength(2);
    expect(tags.map(n=>n.children.find(c=>c.className==='level-value').textContent)).toEqual(['W 42','C 17']);
    expect(tags.map(n=>n.children.find(c=>c.className==='level-background').src)).toEqual(['https://cdn.example/wealth.png','https://cdn.example/charm.png']);
  });
  it('shows configured rewards as TOP cards with prop artwork',async()=>{
    const {get}=await fixture('wealth',{enabled:true,effectiveFrom:'2026-10-19T00:00:00Z',rewards:[{rank:1,coins:'500',diamonds:'20',props:[{name:'Gold frame',days:7,url:'https://media.example/frame.gif',mimeType:'image/gif'}],vip:{name:'VIP 3',days:2}}]});
    const nodes=descendants(get('reward-details'));
    get('rewards').onclick();expect(get('rewards-dialog').open).toBe(true);
    get('close-rewards').onclick();expect(get('rewards-dialog').open).toBe(false);
    expect(nodes.some(n=>n.className==='reward-rank'&&n.textContent==='TOP 1')).toBe(true);
    expect(nodes.some(n=>n.textContent==='500 Coins')).toBe(true);
    expect(nodes.some(n=>n.textContent==='VIP 3')).toBe(true);
    expect(nodes.some(n=>n.className==='reward-art'&&n.src==='https://media.example/frame.gif')).toBe(true);
  });
  it.each(['wealth','charm','agency','cp'])('keeps the separate %s event fixed when switching periods',async track=>{
    const {get,requests,flush}=await fixture(track);
    get('periods').children[1].onclick();await flush();
    expect(get('tracks').children).toHaveLength(1);
    for(const url of requests){const p=new URL(url,'https://example.test').searchParams;expect(p.get('type')).toBe(track);expect(p.get('event')).toBe(`ranking-${track}`);}
    expect(new URL(requests.at(-1),'https://example.test').searchParams.get('period')).toBe('week');
  });
  it.each(['Wealth','Charm'])('%s names navigate from hero, podium and list',async tab=>{
    const {get,messages,flush}=await fixture();
    get('tracks').children.find(n=>n.textContent===tab).onclick();await flush();
    const buttons=[...descendants(get('hero')),...descendants(get('entries'))].filter(n=>n.className==='name entry-name');
    expect(buttons).toHaveLength(5);
    for(const button of buttons){messages.length=0;button.onclick();expect(messages).toEqual([{type:'ranking:open-profile',publicId:`USR-${button.textContent.split(' ').at(-1)}`}]);}
  });
  it('agency cards send agency IDs rather than owner IDs',async()=>{
    const {get,messages,flush}=await fixture();get('tracks').children.find(n=>n.textContent==='Agency').onclick();await flush();
    const buttons=descendants(get('entries')).filter(n=>n.tag==='button');expect(buttons).toHaveLength(4);
    for(const [i,button] of buttons.entries()){messages.length=0;button.onclick();expect(messages).toEqual([{type:'ranking:open-agency',agencyPublicId:`AGN-${i+1}`}]);}
  });
  it('switches event rules independently and opens a separate rules dialog',async()=>{
    const {get,flush}=await fixture();
    get('rules').onclick();expect(get('rules-dialog').open).toBe(true);
    expect(get('rule-text').textContent).toContain('gifts sent');
    get('tracks').children.find(n=>n.textContent==='Charm').onclick();await flush();
    expect(get('rules-title').textContent).toBe('Charm event rules');
    expect(get('rule-text').textContent).toContain('gifts received');
    get('tracks').children.find(n=>n.textContent==='CP').onclick();await flush();
    expect(get('rule-text').textContent).toContain('active CP partners');
    expect(get('award-rules').textContent).toContain('Both CP partners');
    get('close-rules').onclick();expect(get('rules-dialog').open).toBe(false);
  });
  it('preserves the close message',async()=>{const {get,messages}=await fixture();messages.length=0;get('back').onclick();expect(messages).toEqual([{type:'ranking:close'}]);});
});
