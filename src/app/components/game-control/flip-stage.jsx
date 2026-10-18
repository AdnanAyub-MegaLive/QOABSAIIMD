"use client";

export default function FlipStage({ busy, result, choice }) {
  const settled = result?.status === 'settled';
  const side = settled ? result.result : choice;
  return <div className={`game-theater theater-flip ${busy && !settled ? 'tossing' : ''} ${settled ? 'coin-revealed' : ''} ${settled && !busy ? result.outcome : ''}`}>
    <div className="theater-glow"/>
    <div className="coin-halo"/>
    <div className="coin-shadow"/>
    <div key={result?.id || (busy ? 'toss' : choice)} className="coin-flight">
      <div className="lucky-coin" style={{'--coin-end': side === 'tails' ? '1260deg' : '1080deg', '--coin-rest': side === 'tails' ? '180deg' : '0deg'}} aria-label={settled && !busy ? `Coin landed on ${side}` : 'Lucky Flip coin'}>
        <div className="coin-face coin-heads"><small>MEGA LIVE</small><b>H</b><span>HEADS</span></div>
        <div className="coin-face coin-tails"><small>MEGA LIVE</small><b>T</b><span>TAILS</span></div>
      </div>
    </div>
    <div className="coin-caption">{busy ? 'IN THE AIR' : settled ? `${side.toUpperCase()} IT IS` : 'MAKE YOUR PICK'}</div>
    {settled && !busy && result.outcome === 'win' && <div className="win-sparks" aria-hidden="true">{Array.from({length:8},(_,i)=><i key={i} style={{'--spark-angle':`${i*45}deg`}}/>)}</div>}
  </div>;
}
