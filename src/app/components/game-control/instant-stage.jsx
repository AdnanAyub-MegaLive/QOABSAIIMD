"use client";

const sectors = [0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,2,2,3,8];
const hands = { rock: '✊', paper: '✋', scissors: '✌' };
const pips = { 1:[5], 2:[1,9], 3:[1,5,9], 4:[1,3,7,9], 5:[1,3,5,7,9], 6:[1,3,4,6,7,9] };
const rank = n => ({1:'A',11:'J',12:'Q',13:'K'}[n] || n);

export default function InstantStage({ engine, busy, result, choice }) {
  const settled = result?.status === 'settled';
  const rolling = busy && !settled;
  const value = settled ? result.result : null;
  const state = rolling ? 'rolling' : settled ? 'revealed' : 'idle';
  return <div className={`game-theater theater-${engine} ${state} ${settled && !busy ? result.outcome : ''}`} aria-label={`${engine} game animation`}>
    <div className="theater-glow"/>
    {engine === 'dice' && <>
      <div className="dice-orbit"/>
      <div key={result?.id || state} className="game-die" aria-label={value ? `Rolled ${value}` : 'Dice ready'}>
        {Array.from({length:9},(_,i)=><i key={i} className={pips[Number(value) || 5].includes(i+1) ? 'pip lit' : 'pip'}/>)}
      </div>
      <div className="theater-caption"><span className={choice === 'low' ? 'selected' : ''}>LOW <b>1 · 2 · 3</b></span><span className={choice === 'high' ? 'selected' : ''}>HIGH <b>4 · 5 · 6</b></span></div>
    </>}
    {engine === 'wheel' && <div className="prize-wheel-wrap">
      <span className="prize-pointer"/>
      <div key={result?.id || 'ready'} className={`prize-wheel ${settled ? 'land-wheel' : ''}`} style={{'--landing': `${1800 + (360 - sectors.indexOf(Number.parseFloat(value)) * 18 - 9) % 360}deg`}}>
        <svg viewBox="0 0 200 200" aria-label="20 equal prize sectors">
          {sectors.map((prize,i)=>{ const a=i*Math.PI/10,b=(i+1)*Math.PI/10; const x=t=>100+96*Math.sin(t),y=t=>100-96*Math.cos(t);return <g key={i}><path d={`M100 100 L${x(a)} ${y(a)} A96 96 0 0 1 ${x(b)} ${y(b)} Z`} fill={prize===8?'#f3cf73':prize===3?'#bc83e9':prize===2?'#68d5bc':prize===1?'#7797e6':i%2?'#233e39':'#2d4c43'} stroke="#122a25" strokeWidth="1"/><text x="100" y="30" transform={`rotate(${i*18+9} 100 100)`} textAnchor="middle" fill={prize===8?'#342918':'#fff'} fontSize="10" fontWeight="700">{prize}×</text></g>})}
        </svg>
      </div>
      <span className="wheel-hub">M</span>
    </div>}
    {engine === 'dragon' && <div className="duel-cards">
      {['dragon','tiger'].map((side,i)=><div className={`duel-side ${choice===side?'selected':''}`} key={side}>
        <small>{side === 'dragon' ? 'DRAGON' : 'TIGER'}</small>
        <div key={result?.id || state} className={`duel-card card-${i}`}><div className="card-inner"><div className="card-back"><span>{i===0?'龍':'虎'}</span></div><div className="card-face"><b>{rank(value?.split(' · ')[i])}</b><span>{i===0?'♠':'♥'}</span><b>{rank(value?.split(' · ')[i])}</b></div></div></div>
      </div>)}<span className="duel-vs">VS</span>
    </div>}
    {engine === 'slots' && <div className="slot-machine">
      <div className="slot-marquee"><i/> LUCKY THREE <i/></div>
      <div className="slot-reels">{[0,1,2].map(i=><div className={`slot-reel reel-${i}`} key={i}><div key={result?.id || state} className="reel-strip">{rolling ? ['🍒','🍋','🔔','⭐','🍒','🍋','🔔','⭐'].map((symbol,j)=><span key={j}>{symbol}</span>) : <span>{value?.split(' ')[i] || ['🍒','🔔','⭐'][i]}</span>}</div></div>)}</div>
      <div className="slot-payline"/><small>THREE MATCH 6× <span>PAIR 1×</span></small>
    </div>}
    {engine === 'rps' && <div className="hand-duel">
      <div><small>YOUR HAND</small><span className="player-hand">{hands[choice]}</span><b>{choice}</b></div>
      <em>VS</em>
      <div><small>OPPONENT</small><span key={result?.id || state} className="opponent-hand">{value ? hands[value] : '✊'}</span><b>{value || (busy ? 'Choosing…' : 'Ready')}</b></div>
    </div>}
    {settled && !busy && result.outcome === 'win' && <div className="win-sparks" aria-hidden="true">{Array.from({length:8},(_,i)=><i key={i} style={{'--spark-angle':`${i*45}deg`}}/>)}</div>}
  </div>;
}
