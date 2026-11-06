import { cycleHostTotals, salaryProgress, agencyShares, scheduleFor } from './host-salary.js';
import { moduleCycle } from './reporting-cycles.js';
import { grantTaskReward } from './task-center-rewards.js';
import { ledgerData } from './wallet.js';

export async function closeHostSalaryCycle(db, now=new Date()) {
  const control=await db.hostSalaryControl.findUnique({where:{id:'global'}});
  if(!control)return;
  const period=await moduleCycle(db,'HOST_SALARY',control.nextCloseStart);
  if(period.end>now)return;
  const schedule=await scheduleFor(db,period.start);
  if(!schedule)throw new Error('No salary schedule for closing period');
  const hosts=await cycleHostTotals(db,period);
  const deferred=[];
  for(const [userId,host] of hosts) {
    try {
      const tier=salaryProgress(host.total,schedule.tiers).current;
      if(host.incomplete)throw new Error('Unvalued host gifts require review before salary close');
      if(!tier)continue;
      await db.$transaction(async tx=>{
        const receipt=await tx.hostSalaryAward.createMany({skipDuplicates:true,data:{cycleStart:period.start,userId,level:tier.level,
          earned:host.total,rewardDiamonds:BigInt(tier.reward),agencyShares:agencyShares(host.agencies,tier)}});
        if(!receipt.count)return;
        const reference=`host-salary:${period.key}:${userId}`;
        if(tier.reward) {
          await tx.user.update({where:{id:userId},data:{hostSalaryCoinBalance:{increment:BigInt(tier.reward)},walletRevision:{increment:1}}});
          await tx.walletTransaction.create({data:ledgerData({userId,type:'HOST_SALARY_REWARD',direction:'CREDIT',title:'Host salary cycle reward',diamonds:BigInt(tier.reward),referenceId:reference})});
        }
        if(tier.vip) {
          const vip=await tx.vipTier.findFirstOrThrow({where:{level:tier.vip,active:true}});
          await grantTaskReward(tx,userId,{kind:'VIP',id:vip.id,days:tier.days},reference,now);
        }
      },{isolationLevel:'Serializable'});
    } catch(error) {
      deferred.push(userId);
      console.error('Host salary award deferred',{userId,cycle:period.key,reason:error.code ?? error.message});
    }
  }
  if(deferred.length)throw new Error(`Retry required for ${deferred.length} salary awards in ${period.key}`);
  await db.hostSalaryControl.updateMany({where:{id:'global',nextCloseStart:control.nextCloseStart},data:{nextCloseStart:period.end}});
}
