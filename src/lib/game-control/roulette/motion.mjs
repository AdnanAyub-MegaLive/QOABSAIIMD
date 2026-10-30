import { wheelOrder } from './original-rules.mjs';
export const ROULETTE_LANDING_MS = 1600;
export const ROULETTE_RESULT_HOLD_MS = 450;
export function rouletteLandingAngle(current, result) {
 const index=wheelOrder.indexOf(result);
 if(index<0)throw new Error('Invalid roulette result');
 const target=(360-index*360/wheelOrder.length)%360;
 return current+720+(target-(current%360)+360)%360;
}
