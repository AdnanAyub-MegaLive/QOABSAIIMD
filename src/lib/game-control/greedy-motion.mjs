export function greedySpinStep(elapsed, duration = 10000) {
 const t=Math.max(0,elapsed),ramp=Math.max(500,Math.min(2000,duration*.2)),speed=1/105;
 return Math.floor(t<ramp?speed*t*t/(2*ramp):speed*(t-ramp/2));
}
export function greedyLandingStep(start,target,progress){
 const end=start+8+((target-start%8+8)%8),p=Math.max(0,Math.min(1,progress));
 return p===1?end:Math.floor(start+(end-start)*(1-(1-p)**3));
}
