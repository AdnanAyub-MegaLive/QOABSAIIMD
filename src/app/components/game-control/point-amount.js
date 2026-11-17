'use client';
import { useEffect } from 'react';
import { coinButtons } from '@/lib/game-control/coin-buttons.mjs';
import styles from './play-panel-utilities';
import picker from './point-amount.module.css';
const label = n => n >= 1000000 && n % 1000000 === 0 ? `${n / 1000000}M` : n >= 1000 && n % 1000 === 0 ? `${n / 1000}K` : n.toLocaleString();
export default function PointAmount({ game, balance, value, onChange, disabled }) {
 const available=Number(balance ?? game?.maxBet ?? 0),chips=coinButtons(game);
 const fallback=chips[0];
 const valid=chips.includes(value);
 useEffect(()=>{if(!valid&&fallback!==undefined&&!disabled)onChange(fallback,false);},[valid,fallback,disabled,onChange]);
 return <div className={`${styles.amountPicker} ${picker.picker}`}><div className={styles.chips}>{chips.map(n=><button type="button" key={n} disabled={disabled||n>available} aria-label={`${n.toLocaleString()} coins`} title={`${n.toLocaleString()} coins`} aria-pressed={value===n} onClick={()=>onChange(n,false)}><img src="/games/common/coins.webp" width="24" height="28" alt=""/><span>{label(n)}</span></button>)}</div></div>;
}
