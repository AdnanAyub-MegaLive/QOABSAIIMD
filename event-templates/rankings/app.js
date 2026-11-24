(() => {
  'use strict';
  const frame=document.getElementById('ranking-page');
  let token='';
  const notify=data=>window.ReactNativeWebView?.postMessage(JSON.stringify(data));
  function connect(){
    const child=frame.contentWindow;
    // The wrapper supplies category navigation; embedded Agency/CP retain all
    // their own artwork, period controls, rewards and standalone navigation.
    const embedded=/\/ranking-(agency|cp|wealth|charm)\//.exec(new URL(frame.src,window.location.href).pathname);
    if (embedded) {
      const doc=child.document;
      if (!doc.getElementById('all-rankings-navigation')) {
        const style=doc.createElement('style');
        style.id='all-rankings-navigation';
        style.textContent='#tracks { display:none !important; }'+(embedded[1]==='wealth'||embedded[1]==='charm'?' #filters { margin-top:50px !important; }':'')+(embedded[1]==='cp'?' #ranking header { justify-content:space-between !important; }':'');
        doc.head.append(style);
      }
    }
    // Forward native navigation events from the actual standalone page.
    child.ReactNativeWebView={postMessage(value){
      try { const data=JSON.parse(value); if(data.type!=='ranking:ready')notify(data); } catch {}
    }};
    if(token)child.MegaRankings?.setSession(token);
  }
  frame.addEventListener('load',connect);
  document.querySelectorAll('[data-track]').forEach(button=>{
    button.addEventListener('click',()=>{
      document.querySelectorAll('[data-track]').forEach(tab=>tab.setAttribute('aria-selected',String(tab===button)));
      frame.title=button.textContent+' Ranking';
      frame.src='/event/ranking-'+button.dataset.track+'/index.html';
    });
  });
  window.MegaRankings=Object.freeze({
    setSession(value){if(typeof value!=='string'||!value||value.length>8192)return;token=value;connect();},
    clearSession(){token='';frame.contentWindow.MegaRankings?.clearSession();}
  });
  notify({type:'ranking:ready',version:1});
})();
