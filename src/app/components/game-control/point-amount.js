import { coinButtons } from '@/lib/game-control/coin-buttons.mjs';
import styles from './play-panel.module.css';
export default function PointAmount({ game, balance, value, custom, onChange, disabled }) {
 const available=Number(balance ?? game?.maxBet ?? 0),chips=coinButtons(game);
 return <div className={styles.amountPicker}><div className={styles.chips}>{chips.map(n=><button type="button" key={n} disabled={disabled||n>available} aria-label={`${n.toLocaleString()} coins`} aria-pressed={!custom&&value===n} onClick={()=>onChange(n,false)}>{n.toLocaleString()}</button>)}<button type="button" disabled={disabled} aria-pressed={custom} onClick={()=>onChange(value,true)}>Custom</button><button type="button" disabled={disabled||available<1} onClick={()=>onChange(available,true)}>All in</button></div>{custom&&<label className={styles.customAmount}>Coins<input aria-label="Custom coins" type="number" inputMode="numeric" min={1} max={available} step={1} disabled={disabled} value={Number.isNaN(value)?'':value} onChange={e=>onChange(e.target.value===''?NaN:Number(e.target.value),true)}/><small>Available: {available.toLocaleString()}</small></label>}</div>;
}
