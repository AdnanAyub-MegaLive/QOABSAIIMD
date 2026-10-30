import {expect,it} from 'vitest';
import {wheelOrder} from './original-rules.mjs';
import {rouletteLandingAngle} from './motion.mjs';
it('lands every server result under the fixed top pointer without reversing',()=>{
 for(const current of [0,19,359.9,720,1783.4])for(const result of wheelOrder){
  const target=rouletteLandingAngle(current,result);
  expect(target-current).toBeGreaterThanOrEqual(720);
  const pocketAtPointer=((target+wheelOrder.indexOf(result)*360/37)%360+360)%360;
  expect(Math.min(pocketAtPointer,360-pocketAtPointer)).toBeLessThan(.00001);
 }
});
it('rejects an invalid winning pocket',()=>{expect(()=>rouletteLandingAngle(0,37)).toThrow();});
