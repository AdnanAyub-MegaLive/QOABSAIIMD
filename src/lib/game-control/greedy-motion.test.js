import {describe,it,expect} from 'vitest';
import {greedySpinStep,greedyLandingStep} from './greedy-motion.mjs';
describe('Greedy visual landing',()=>{
 it('lands exactly on every server target from every previous position',()=>{
  for(let start=0;start<80;start++)for(let target=0;target<8;target++){
   let previous=start;
   for(let i=0;i<=100;i++){const step=greedyLandingStep(start,target,i/100);expect(step).toBeGreaterThanOrEqual(previous);previous=step;}
   expect(previous%8).toBe(target);
  }
 });
 it('accelerates at the start and decelerates toward the result',()=>{
  expect(greedySpinStep(500)).toBeLessThan(greedySpinStep(2000)-greedySpinStep(1500));
  expect(greedyLandingStep(0,7,.25)).toBeGreaterThan(greedyLandingStep(0,7,1)-greedyLandingStep(0,7,.75));
 });
});
