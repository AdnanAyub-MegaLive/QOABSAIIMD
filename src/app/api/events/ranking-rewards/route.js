import { requireEventUser } from '@/lib/events/auth';
import { eventJson, eventErrorResponse, EventModuleError } from '@/lib/events/errors';
import { saveRankingRewards } from '@/lib/events/ranking-rewards';
import { prisma } from '@/lib/prisma';

export async function POST(request) {
  try {
    const user = await requireEventUser(request,{csrf:true,roles:['SUPER_ADMIN']});
    const input = await request.json();
    if (input.retryRoundId) {
      await prisma.$transaction(async tx => {
        const round = await tx.rankingRewardRound.findUnique({where:{id:input.retryRoundId}});
        if (!round || round.status !== 'REVIEW') throw new EventModuleError('INVALID_ROUND','Only held rounds can be retried.',409);
        const changed=await tx.rankingRewardRound.updateMany({where:{id:round.id,status:'REVIEW'},data:{status:'PENDING',error:null}});
        if(!changed.count)throw new EventModuleError('INVALID_ROUND','This round has already changed. Refresh before retrying.',409);
        await tx.eventAuditLog.create({data:{userId:user.id,action:'RANKING_REWARD_RETRY',metadata:{roundId:round.id}}});
      });
      return eventJson({success:true});
    }
    let policy;
    try { policy = await saveRankingRewards(input,user); }
    catch(error) { if (error.code) throw error; throw new EventModuleError('VALIDATION_ERROR',error.message,422); }
    return eventJson({success:true,data:{policy}});
  } catch(error) { return eventErrorResponse(error); }
}
