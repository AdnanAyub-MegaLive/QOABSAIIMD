import { coinButtons } from "@/lib/game-control/coin-buttons.mjs";
import styles from "./play-panel.module.css";
export default function PointAmount({ game, value, custom, onChange, disabled, roulette = false }) {
 const chips=coinButtons(game);
 const chipArt=n=>roulette&&[100,1000,10000,100000].includes(n)?`/games/roulette/design/chip-${n}.png`:null;
 return <div className={styles.amountPicker}><div className={styles.chips}>{chips.map(n=><button type="button" key={n} className={chipArt(n)?"roulette-image-chip":undefined} style={chipArt(n)?{backgroundImage:`url("${chipArt(n)}")`}:undefined} aria-label={`${n.toLocaleString()} coins`} disabled={disabled} aria-pressed={!custom&&value===n} onClick={()=>onChange(n,false)}><span>{n.toLocaleString()}</span></button>)}<button type="button" disabled={disabled} aria-pressed={custom} onClick={()=>onChange(value,true)}>Custom</button></div>{custom&&<label className={styles.customAmount}>Coins<input aria-label="Custom coins" type="number" inputMode="numeric" min={game?.minBet||1} max={game?.maxBet||1000} step={1} disabled={disabled} value={Number.isNaN(value)?"":value} onChange={e=>onChange(e.target.value===""?NaN:Number(e.target.value),true)} /><small>{game?.minBet}–{game?.maxBet}</small></label>}</div>;
}
