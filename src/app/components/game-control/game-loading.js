'use client';
import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import styles from './game-loading.module.css';
const LoadingContext=createContext(null);
export function useGameLoading(ready,error=''){
 const context=useContext(LoadingContext),report=context?.report;
 useEffect(()=>{report?.({ready,error});},[ready,error,report]);
 return context?.finished??true;
}
export default function GameLoading({children}){
 const root=useRef(null),[status,setStatus]=useState({ready:false,error:''});
 const [progress,setProgress]=useState(0),[finished,setFinished]=useState(false),[assetError,setAssetError]=useState('');
 const report=useCallback(value=>setStatus(value),[]);
 useEffect(()=>{const frame=requestAnimationFrame(()=>setProgress(30));return()=>cancelAnimationFrame(frame);},[]);
 useEffect(()=>{
  if(!status.ready||finished)return;
  let cancelled=false,hideTimer;
  const controller=new AbortController();
  const timeout=setTimeout(()=>{controller.abort();if(!cancelled)setAssetError('Loading is taking longer than expected. Please retry.');},120000);
  const run=async()=>{
   // Wait until the first round has rendered before collecting its artwork.
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   if(cancelled)return;
   const urls=new Set();
   root.current.querySelectorAll('img').forEach(img=>{if(img.currentSrc||img.src)urls.add(img.currentSrc||img.src);});
   root.current.querySelectorAll('*').forEach(element=>{
    for(const pseudo of [null,'::before','::after']){
     const background=getComputedStyle(element,pseudo).backgroundImage;
     for(const match of background.matchAll(/url\(["']?(.*?)["']?\)/g))urls.add(match[1]);
    }
   });
   const jobs=[...urls].map(src=>()=>new Promise((resolve,reject)=>{
    const image=new Image();const abort=()=>{image.onload=image.onerror=null;reject(new Error('Loading timed out. Please retry.'));};
    controller.signal.addEventListener('abort',abort,{once:true});
    const done=(error)=>{controller.signal.removeEventListener('abort',abort);image.onload=image.onerror=null;error?reject(error):resolve();};
    image.onload=()=>{if(image.decode)image.decode().then(()=>done(),()=>done());else done();};
    image.onerror=()=>done(new Error('Some game artwork could not load. Please retry.'));image.src=src;
   }));
   jobs.push(()=>document.fonts.ready);
   let loaded=0;setProgress(50);
   await Promise.all(jobs.map(async job=>{await job();loaded++;if(!cancelled)setProgress(50+Math.floor(45*loaded/jobs.length));}));
   if(cancelled||controller.signal.aborted)return;
   clearTimeout(timeout);setProgress(100);
   hideTimer=setTimeout(()=>setFinished(true),350);
  };
  run().catch(error=>{if(!cancelled)setAssetError(error.message);});
  return()=>{cancelled=true;clearTimeout(timeout);clearTimeout(hideTimer);controller.abort();};
 },[status.ready,finished]);
 const error=status.error||assetError;
 return <LoadingContext.Provider value={{report,finished}}><div data-game-load-progress={progress} data-game-load-error={error||undefined}>
  <div ref={root} inert={!finished} aria-hidden={!finished}>{children}</div>
  {!finished&&<div className={styles.screen} role="status" aria-live="polite">
   <div className={styles.content}><span className={styles.mark} aria-hidden="true">✦</span><h1>Loading game</h1>
    <p>{error||'Getting everything ready for you…'}</p>
    <div className={styles.track} role="progressbar" aria-label="Game loading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div style={{width:`${progress}%`}}/></div>
    <strong>{progress}%</strong>
    {error&&<button onClick={()=>location.reload()}>Retry</button>}
   </div>
  </div>}
 </div></LoadingContext.Provider>;
}
