"use client";

export default function FlipStage({ busy, result, choice }) {
  const settled = result?.status === 'settled';
  const side = settled ? result.result : choice;
  return <div className={`game-theater theater-flip ${busy && !settled ? 'tossing' : ''} ${settled ? 'coin-revealed' : ''} ${settled && !busy ? result.outcome : ''}`}>
    <div className="theater-glow"/>
    <div className="coin-halo"/>
    <div className="coin-shadow"/>
    <div key={result?.id || (busy ? 'toss' : choice)} className="coin-flight">
      <div className={`lucky-coin ${side === "tails" ? "[--coin-end:1260deg] [--coin-rest:180deg]" : "[--coin-end:1080deg] [--coin-rest:0deg]"}`} aria-label={settled && !busy ? `Coin landed on ${side}` : 'Lucky Flip coin'}>
        <div className="coin-face coin-heads"><small>MEGA LIVE</small><b>H</b><span>HEADS</span></div>
        <div className="coin-face coin-tails"><small>MEGA LIVE</small><b>T</b><span>TAILS</span></div>
      </div>
    </div>
    <div className="coin-caption">{busy ? 'IN THE AIR' : settled ? `${side.toUpperCase()} IT IS` : 'MAKE YOUR PICK'}</div>
    {settled && !busy && result.outcome === 'win' && <div className="win-sparks" aria-hidden="true">{Array.from({length:8},(_,i)=><i key={i} className={["[--spark-angle:0deg]","[--spark-angle:45deg]","[--spark-angle:90deg]","[--spark-angle:135deg]","[--spark-angle:180deg]","[--spark-angle:225deg]","[--spark-angle:270deg]","[--spark-angle:315deg]"][i]}/>)}</div>}
  </div>;
}
