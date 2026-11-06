"use client";
import {useEffect,useRef,useState} from "react";
import {useStore,api} from "./store";
import RocketPlayer from "./rocket-player";
import SharedPlayer from "./shared-player";
import styles from "./play-panel-utilities";
export default function Player({defaultGame="lucky-flip"}){
 const {isDemo,data}=useStore();
 const [profile,setProfile]=useState(null),[gameId,setGameId]=useState(null),[error,setError]=useState("");
 const launched=useRef(false);
 useEffect(()=>{
  if(launched.current)return;launched.current=true;
  const params=new URLSearchParams(location.search);setGameId(params.get("game")||defaultGame);
  if(isDemo)return;
  const token=new URLSearchParams(location.hash.slice(1)).get("token")||params.get("token");
  if(token){params.delete("token");history.replaceState(null,"",location.pathname+"?"+params);}
  api("player",token?{action:"launch",token,roomId:params.get("roomId")}:{action:"profile"}).then(setProfile).catch(e=>setError(e.message));
 },[defaultGame,isDemo]);
 const game=(isDemo?data.games:profile?.games||[]).find(g=>g.id===gameId);
 if(game) {
   const restricted=!isDemo && game.previewOnly;
   const board=game.engine==="external"?<section className={styles.panel}><h1>{game.name}</h1></section>
     :game.engine==="rocket"?<RocketPlayer key={game.id} gameId={game.id} preview={isDemo}/>
     :<SharedPlayer key={game.id} gameId={game.id} preview={isDemo}/>;
   if(restricted)return <><fieldset disabled style={{display:"contents"}}>{board}</fieldset><div role="status" style={{position:"fixed",top:0,left:0,right:0,zIndex:100,textAlign:"center",padding:8,background:"#271a37",color:"white"}}>Preview only · Betting disabled</div></>;
   return board;
 }
 return <section className={styles.panel}><h1>Room games</h1><p role="status">{error||(gameId&&(profile||isDemo)?"This game is unavailable.":"Connecting to the room game…")}</p></section>;
}
