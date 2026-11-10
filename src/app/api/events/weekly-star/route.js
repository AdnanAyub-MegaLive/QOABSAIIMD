import { requireEventUser } from '@/lib/events/auth';
import { eventJson,eventErrorResponse,EventModuleError } from '@/lib/events/errors';
import { weeklyStarInput } from '@/lib/events/weekly-star';
import { prisma } from '@/lib/prisma';
export async function POST(request) {
  try {
    const user=await requireEventUser(request,{csrf:true,roles:['SUPER_ADMIN']});
    const input=await request.json();
    await prisma.$transaction(async tx=>{
      const data=weeklyStarInput(input);
      const count=await tx.uploadAsset.count({where:{id:{in:data.giftIds},active:true,category:'GIFTS'}});
      if(count!==data.giftIds.length)throw new EventModuleError('VALIDATION_ERROR','Choose active gifts only.',422);
      await tx.weeklyStarWeek.upsert({where:{startsAt:data.startsAt},create:{...data,createdById:user.id},update:{giftIds:data.giftIds,createdById:user.id}});
      await tx.eventAuditLog.create({data:{userId:user.id,action:'WEEKLY_STAR_CONFIGURED',metadata:{week:input.week,giftIds:data.giftIds}}});
    });
    return eventJson({success:true});
  }catch(error){return eventErrorResponse(error);}
}
