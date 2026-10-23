export const taskMetrics = {
  SIGN_IN: "Daily check-in", SEND_GIFTS: "Gift quantity sent", GIFT_COINS_SENT: "Gift Coin value sent",
  GIFT_COINS_RECEIVED: "Gift Coin value received", JOIN_AGENCY: "Currently in an agency",
  BIND_CP: "Active CP relationship", CREATE_ROOM: "Own an audio room", LIKE_POSTS: "Like distinct Moments",
  FOLLOW_USERS: "Follow distinct users", EXCHANGE: "Completed Diamond exchanges",
  RECHARGE_COUNT: "Completed personal recharges (count)", RECHARGE_COINS: "Completed personal recharges (Coins)",
  ROOM_WATCH: "Recorded room listening seconds", LIVE_GO_LIVE: "Recorded room hosting seconds",
  ON_MIC: "Recorded seated seconds", MANUAL: "Admin-verified evidence", COMPLETE_TASKS: "Category completion bonus",
  PLAY_FREE_GAME: "Completed server-recorded free-points rounds",
};
export const metricOf = d => d.metric || (d.type === "TOP_SUPPORTER" ? "SEND_GIFTS" : d.type);
const fail = message => { throw Object.assign(new Error(message), {status:422,code:"VALIDATION_ERROR"}); };
export function integer(value, label, min=0, max=2147483647) {
  const n=Number(value); if (!Number.isSafeInteger(n)||n<min||n>max) fail(`${label} must be a whole number between ${min} and ${max}.`); return n;
}
export function validateReward(value) {
  const r=value??{kind:"COINS",coins:"0"};
  if(r.kind==="COINS") return {kind:"COINS",coins:String(integer(r.coins,"Reward Coins",0,1000000000))};
  if(!["VIP","PROP"].includes(r.kind)) fail("Choose Coins, VIP or a prop reward.");
  const id=String(r.id??"").trim();if(!id||id.length>100)fail("Choose a reward asset or VIP tier.");
  return {kind:r.kind,id,days:integer(r.days,"Reward duration (days)",1,365)};
}
export function validateTaskOptions(body) {
  const metric=body.metric||(body.type==="TOP_SUPPORTER"?"SEND_GIFTS":body.type);
  if(!taskMetrics[metric]) fail("Choose a supported progress source; use admin verification for external activities.");
  const c=body.config??{}, config={};
  if(c.requiresGiftSelection){config.requiresGiftSelection=true;if(body.active!==false&&!c.giftAssetId)fail("Select the specific gift before enabling this task.");}
  if(c.giftAssetId)config.giftAssetId=String(c.giftAssetId).slice(0,100);
  if(metric==="FOLLOW_USERS")config.minLevel=integer(c.minLevel??0,"Minimum Wealth/Charm level",0,10000);
  if(metric==="RECHARGE_COUNT")config.minCoins=String(integer(c.minCoins??1000,"Minimum recharge",1,500000000));
  if(metric==="COMPLETE_TASKS")config.requiredCount=integer(c.requiredCount??0,"Required completed tasks (0 = all)",0,1000);
  if(metric==="SIGN_IN") {
    if(body.cadence!=="DAILY")fail("Check-in must use a daily period.");
    if(c.days){if(!Array.isArray(c.days)||c.days.length!==7)fail("Provide exactly seven check-in rewards.");config.days=c.days.map(validateReward);}
  }
  return {metric,config,rewardSpec:validateReward(body.rewardSpec??{kind:"COINS",coins:body.rewardCoins})};
}
export function checkInDay(streak, now) {
  const today=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
  const last=streak?.lastSignInDate?.getTime();
  const count=last===today?streak.currentStreak:last===today-86400000?streak.currentStreak+1:1;
  return {count,day:((Math.max(count,1)-1)%7)+1,claimedToday:last===today};
}
