import styles from "./play-panel.module.css";
export default function PointAmount({ game, value, custom, onChange, disabled }) {
 const chips=[...new Set([game?.minBet||10,100,500,1000])].filter(n=>n>=(game?.minBet||1)&&n<=(game?.maxBet||1000));
 return <div className={styles.amountPicker}><div className={styles.chips}>{chips.map(n=><button type="button" key={n} disabled={disabled} aria-pressed={!custom&&value===n} onClick={()=>onChange(n,false)}>{n.toLocaleString()}</button>)}<button type="button" disabled={disabled} aria-pressed={custom} onClick={()=>onChange(value,true)}>Custom</button></div>{custom&&<label className={styles.customAmount}>Free points<input aria-label="Custom free points" type="number" inputMode="numeric" min={game?.minBet||1} max={game?.maxBet||1000} step={1} disabled={disabled} value={Number.isNaN(value)?"":value} onChange={e=>onChange(e.target.value===""?NaN:Number(e.target.value),true)} /><small>{game?.minBet}–{game?.maxBet}</small></label>}</div>;
}
