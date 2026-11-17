import {greedyFoods} from '@/lib/game-control/greedy.mjs';
import styles from './greedy.module.css';
export default function GreedyFood({food,large=false}){
 const index=greedyFoods.findIndex(item=>item.id===food);
 if(index<0)return <span aria-label="Result pending">—</span>;
 return <span role="img" aria-label={greedyFoods[index].name} className={`${styles.foodIcon} ${large?styles.largeIcon:''}`} style={{backgroundPosition:`${index%4*100/3}% ${index<4?0:100}%`}}/>;
}
