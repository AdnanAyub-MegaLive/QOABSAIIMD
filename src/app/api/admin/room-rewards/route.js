import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/portal-admin';
import { sameOrigin } from '@/lib/game-control/http';
import { nextRoomRewardDay } from '@/lib/room-rewards';
const failure=e=>Response.json({success:false,error:{message:e.status?e.message:'Unable to update room rewards.'}},{status:e.status??500});
export async function GET(){try{await requirePermission('rules.view');const [policies,payouts]=await Promise.all([prisma.roomRewardPolicy.findMany({orderBy:[{effectiveFrom:'desc'},{version:'desc'}]}),prisma.roomRewardPayout.findMany({orderBy:{createdAt:'desc'},take:50})]);return Response.json({success:true,data:{policies,payouts:payouts.map(p=>({...p,giftCoins:p.giftCoins.toString(),diamonds:p.diamonds.toString()}))}},{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
export async function POST(request){try{
 const admin=await requirePermission('rules.manage');sameOrigin(request);const body=await request.json();
 if(body.retryId){await prisma.$transaction(async tx=>{await tx.roomRewardPayout.updateMany({where:{id:String(body.retryId),status:'REVIEW'},data:{status:'PENDING',error:null}});await tx.auditLog.create({data:{adminId:admin.id,action:'ROOM_REWARD_RETRY',category:'FINANCE',entityType:'RoomRewardPayout',entityId:String(body.retryId),description:'Requested safe retry of held reward.'}});});return Response.json({success:true});}
 if(!Number.isInteger(body.rateBps)||body.rateBps<0||body.rateBps>10000||typeof body.enabled!=='boolean')throw Object.assign(new Error('Use a percentage from 0 to 100.'),{status:422});
 const policy=await prisma.$transaction(async tx=>{const row=await tx.roomRewardPolicy.create({data:{rateBps:body.rateBps,enabled:body.enabled,effectiveFrom:nextRoomRewardDay()}});await tx.auditLog.create({data:{adminId:admin.id,action:'ROOM_REWARD_POLICY_UPDATED',category:'FINANCE',entityType:'RoomRewardPolicy',entityId:String(row.version),description:'Updated room rewards for future complete UTC days.',metadata:{rateBps:row.rateBps,enabled:row.enabled,effectiveFrom:row.effectiveFrom.toISOString()}}});return row;});return Response.json({success:true,data:policy});
 }catch(e){return failure(e);}}
