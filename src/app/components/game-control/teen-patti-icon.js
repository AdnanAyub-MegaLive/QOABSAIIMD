import styles from './teen-patti.module.css';
export default function TeenPattiIcon({food}){
 const index=['1','2','3'].indexOf(String(food));
 return <span role="img" aria-label={`Hand ${food}: ${['Orange juice','Cocktail','Beer'][index]||'Unknown'}`} className={styles.drinkIcon} style={{backgroundPosition:`${Math.max(0,index)*50}% center`}}/>;
}
