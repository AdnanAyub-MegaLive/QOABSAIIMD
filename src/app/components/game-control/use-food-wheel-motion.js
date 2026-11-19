'use client';
import {useEffect,useRef,useState} from 'react';
import {greedySpinStep,greedyLandingStep} from '@/lib/game-control/greedy-motion.mjs';

// Keep the animation clock local: network polls must not pause or rewind it.
export default function useFoodWheelMotion({playing,elapsed,duration,target,roundKey,bonus,onSettled}) {
 const [motion,setMotion]=useState({lit:-1,settled:false});
 const step=useRef(0),elapsedRef=useRef(elapsed),callback=useRef(onSettled);
 useEffect(()=>{elapsedRef.current=elapsed;callback.current=onSettled;},[elapsed,onSettled]);
 const spinning=target<0&&playing;
 useEffect(()=>{
  let raf,timer;const begin=performance.now(),start=step.current,initialElapsed=elapsedRef.current;
  if(target<0&&!spinning)return;
  const publish=(lit,settled=false)=>setMotion(old=>old.lit===lit&&old.settled===settled?old:{lit,settled});
  const tick=()=>{
   const time=performance.now()-begin;
   if(target>=0){
    const progress=Math.min(1,time/2400);
    step.current=greedyLandingStep(start,target,progress);
    publish(step.current%8,progress===1);
    if(progress===1){timer=setTimeout(()=>callback.current?.(roundKey),bonus?2500:900);return;}
   }else{step.current=Math.max(step.current,greedySpinStep(initialElapsed+time,duration));publish(step.current%8);}
   raf=requestAnimationFrame(tick);
  };
  raf=requestAnimationFrame(tick);
  return()=>{cancelAnimationFrame(raf);clearTimeout(timer);};
 },[spinning,target,duration,roundKey,bonus]);
 return motion;
}
