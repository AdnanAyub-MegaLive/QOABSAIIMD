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
}
const descendants=n=>[n,...n.children.flatMap(descendants)];
async function fixture() {
  const nodes=new Map(),messages=[];
  const get=id=>{if(!nodes.has(id))nodes.set(id,new Element('div'));return nodes.get(id);};
  get('search').value='';get('heading').parentElement=new Element('div');
  const window={ReactNativeWebView:{postMessage:value=>messages.push(JSON.parse(value))}};
  vm.runInNewContext(readFileSync('event-templates/rankings/app.js','utf8'),{
    window,document:{getElementById:get,createElement:tag=>new Element(tag)},
    URLSearchParams,AbortController,setInterval:()=>0,setTimeout,clearTimeout,
    fetch:async url=>{const type=new URL(url,'https://example.test').searchParams.get('type');return {ok:true,json:async()=>({data:{entries:[1,2,3,4].map(rank=>({id:type==='agency'?`AGN-${rank}`:`USR-${rank}`,name:`Entry ${rank}`,rank,score:'100',person:{publicId:`USR-${rank}`,name:`Person ${rank}`},partner:{publicId:`TLN-${rank}`,name:'Partner'}})),nextOffset:null,generatedAt:new Date().toISOString(),resetsAt:new Date(Date.now()+60000).toISOString()}})};},
  });
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  window.MegaRankings.setSession('test-session');await flush();
  return {get,messages,flush};
}
describe('ranking native navigation',()=>{
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
  it('preserves the close message',async()=>{const {get,messages}=await fixture();messages.length=0;get('back').onclick();expect(messages).toEqual([{type:'ranking:close'}]);});
});
