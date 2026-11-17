import {pizzaFoods} from '@/lib/game-control/pizza.mjs';
export default function PizzaFood({food}){const item=pizzaFoods.find(f=>f.id===food);return item?<img src={`/games/pizza/${food}.webp`} alt={item.name} style={{width:'1.8em',height:'1.8em',objectFit:'contain',display:'inline-block'}}/>:null;}
