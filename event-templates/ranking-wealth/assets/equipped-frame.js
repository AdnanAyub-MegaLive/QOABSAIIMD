/* Equipped frame media for rank 4 onward. No profile navigation. */
window.RankingFrame=(()=>{
 const states=new Set();let library;
 const safe=url=>typeof url==='string' && /^(https?:\/\/|\/)/i.test(url);
 function cleanup(){for(const s of states)if(!s.host.isConnected){s.disposed=true;s.player?.destroy();states.delete(s);}}
 new MutationObserver(cleanup).observe(document.documentElement,{subtree:true,childList:true});
 document.addEventListener('visibilitychange',()=>{for(const s of states){if(document.hidden)s.player?.pause();else s.player?.resume();}});
 window.addEventListener('pagehide',()=>{for(const s of states){s.disposed=true;s.player?.destroy();}states.clear();});
 return function(host,person){
  const url=person?.frameUrl,mime=person?.frameMimeType||'';if(!safe(url))return;
  const image=src=>{const im=document.createElement('img');im.className='ranking-avatar-frame';im.alt='';im.src=src;im.onerror=()=>im.remove();host.append(im);return im;};
  if(mime.startsWith('image/')||/\.(png|gif|webp|jpe?g)(\?|$)/i.test(url)){image(url);return;}
  const poster=safe(person.framePosterUrl)?image(person.framePosterUrl):null;
  if(mime.startsWith('video/')||/\.mp4(\?|$)/i.test(url)){const v=document.createElement('video');v.className='ranking-avatar-frame';v.muted=true;v.autoplay=true;v.loop=true;v.playsInline=true;v.src=url;v.onloadeddata=()=>poster?.remove();v.onerror=()=>v.remove();host.append(v);return;}
  if(!/svga/i.test(mime+' '+url))return;
  const state={host,disposed:false,player:null};states.add(state);
  library ||= window.SVGA?Promise.resolve():new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='assets/svga.lite-1.6.1.min.js';s.onload=resolve;s.onerror=reject;document.head.append(s);});
  (async()=>{let parser;try{await library;if(state.disposed)return;parser=new SVGA.Parser({disableWorker:true});const r=await fetch(url);if(!r.ok)throw Error('Frame unavailable');const data=await parser.do(await r.arrayBuffer());if(state.disposed)return;const c=document.createElement('canvas');c.className='ranking-avatar-frame';host.append(c);const player=new SVGA.Player(c);state.player=player;player.set({loop:true,cacheFrames:false});await player.mount(data);if(state.disposed)return;poster?.remove();player.start();if(document.hidden)player.pause();}catch{}finally{parser?.destroy();}})();
 };
})();
