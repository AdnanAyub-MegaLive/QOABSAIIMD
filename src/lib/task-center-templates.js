// Suggested catalogue, not a production balance migration. Installed through the audited admin action.
export function taskCenterTemplates(){
 const rows=[];
 const add=(cadence,key,title,metric,targetValue,coins,config={},rewardSpec=null)=>rows.push({id:`TASK-${cadence}-${key}`,type:`${cadence}_${key}`,title,metric,targetValue,rewardCoins:BigInt(coins),rewardSpec:rewardSpec??{kind:"COINS",coins:String(coins)},config,cadence,categoryKey:cadence==="BEGINNER"?"Beginner":cadence==="MONTHLY"?"Monthly":"Daily",categoryIcon:"tasks",unit:["ON_MIC","ROOM_WATCH","LIVE_GO_LIVE"].includes(metric)?"SECONDS":"COUNT",sortOrder:rows.length*10,active:true,description:metric==="MANUAL"?"Submit evidence for Admin verification. No reward is granted until approved.":null});
 add("DAILY","CHECK_IN","Daily check-in","SIGN_IN",1,77,{days:[77,477,477,577,777,1777,1777].map(coins=>({kind:"COINS",coins:String(coins)}))});
 for(const [cadence,rose,mic,spend] of [["BEGINNER",1,300,500],["DAILY",3,900,1000],["MONTHLY",15,0,0]]){
  add(cadence,"ROSE",`Send ${rose} Rose gifts`,"SEND_GIFTS",rose,cadence==="MONTHLY"?500:100,{requiresGiftSelection:true});
  rows.at(-1).active=false;rows.at(-1).description="Select the Rose gift asset before enabling this task.";
  if(mic)add(cadence,"MIC",`Be on-mic for ${mic/60} minutes`,"ON_MIC",mic,100);
  if(spend)add(cadence,"SPEND",`Send gifts worth ${spend} Coins`,"GIFT_COINS_SENT",spend,20);
 }
 add("BEGINNER","AGENCY","Join an agency","JOIN_AGENCY",1,100);
 add("BEGINNER","CP","Bind a CP relationship","BIND_CP",1,50);
 add("BEGINNER","FOLLOW_ROOMS","Follow 5 rooms","MANUAL",1,200);
 add("BEGINNER","PHONE","Bind a mobile phone number","MANUAL",1,100);
 add("BEGINNER","RECEIVE","Receive gifts worth 1,000 Coins","GIFT_COINS_RECEIVED",1000,30);
 add("BEGINNER","EXCHANGE","Complete your first Diamond exchange","EXCHANGE",1,100);
 add("BEGINNER","ROOM","Create your own voice room","CREATE_ROOM",1,100);
 add("BEGINNER","GAME","Experience a free-points game once","MANUAL",1,100);
 add("BEGINNER","REVIEW","Give us an app review","MANUAL",1,100);
 add("DAILY","BEANS","Send 3 Gold Beans gifts","SEND_GIFTS",3,100,{requiresGiftSelection:true});rows.at(-1).active=false;rows.at(-1).description="Select the Gold Beans gift asset before enabling this task. Reward is Coins.";
 add("DAILY","LIKES","Like 3 Moments","LIKE_POSTS",3,100);
 add("DAILY","SHARE","Share a room","MANUAL",1,100);
 add("MONTHLY","FOLLOW","Follow 5 users at Wealth or Charm level 10+","FOLLOW_USERS",5,1500,{minLevel:10});
 add("MONTHLY","RECHARGE_COUNT","Recharge at least 1,000 Coins five times","RECHARGE_COUNT",5,150,{minCoins:"1000"});
 add("MONTHLY","INVITE","Successfully invite 5 users","MANUAL",1,500);
 add("MONTHLY","RECHARGE_TOTAL","Recharge 7,000,000 Coins","RECHARGE_COINS",7000000,0);rows.at(-1).active=false;rows.at(-1).description="Choose VIP 6 for 15 days, or a Coin reward, before enabling.";
 add("BEGINNER","BONUS","Complete all Beginner tasks","COMPLETE_TASKS",1,0,{requiredCount:0});rows.at(-1).active=false;rows.at(-1).description="Choose VIP 4 for 7 days, or a Coin reward, before enabling.";
 add("DAILY","BONUS","Complete all Daily tasks","COMPLETE_TASKS",1,1,{requiredCount:0});
 add("MONTHLY","BONUS","Complete 4 Monthly tasks","COMPLETE_TASKS",1,10,{requiredCount:4});
 return rows;
}
export async function installTaskCenter(db){
 for(const [n,key] of ["Beginner","Daily","Monthly"].entries())await db.dailyTaskCategory.upsert({where:{key},create:{key,icon:"tasks",sortOrder:n*10,active:true},update:{}});
 for(const row of taskCenterTemplates()){
  if(row.metric==="SIGN_IN"){
   const existing=await db.dailyTaskDefinition.findFirst({where:{active:true,deletedAt:null,OR:[{type:"SIGN_IN"},{metric:"SIGN_IN"}]}});
   if(existing)continue;
  }
  if(row.config.requiresGiftSelection){
   const name=row.type.endsWith("_ROSE")?"Rose":"Gold Beans";
   const matches=await db.uploadAsset.findMany({where:{active:true,category:"GIFTS",name:{equals:name,mode:"insensitive"}},select:{publicId:true},take:2});
   if(matches.length===1){row.config.giftAssetId=matches[0].publicId;row.active=true;row.description=null;}
  }
  if(row.id==="TASK-BEGINNER-BONUS"||row.id==="TASK-MONTHLY-RECHARGE_TOTAL"){
   const level=row.cadence==="BEGINNER"?4:6,days=level===4?7:15;
   const tier=await db.vipTier.findFirst({where:{level,active:true},select:{id:true}});
   if(tier){row.rewardSpec={kind:"VIP",id:tier.id,days};row.active=true;row.description=null;}
  }
  await db.dailyTaskDefinition.upsert({where:{id:row.id},create:row,update:{}});
 }
}
