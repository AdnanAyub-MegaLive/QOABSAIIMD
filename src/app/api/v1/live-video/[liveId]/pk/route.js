import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { emitToVideoLive } from "@/lib/realtime";
import { videoPkDto, videoPkMode, pkConflict } from "@/lib/video-pk";
import { requireVideoAccess, videoError } from "@/lib/video-access";
import { finalizeExpiredPkSessions } from "@/lib/live-maintenance";
export function OPTIONS(){return mobileOptions()}
export async function GET(request,{params}) {
  try {
    const user=await requireMobileUser(request),{liveId}=await params;
    const live=await prisma.videoLiveSession.findUnique({where:{publicId:liveId}});
    await requireVideoAccess(prisma,live,user.id); await finalizeExpiredPkSessions();
    const p=await prisma.videoLivePkSession.findFirst({where:{status:{in:["PENDING","LIVE"]},OR:[{leftSessionId:live.id},{rightSessionId:live.id}]},include:{leftSession:true,rightSession:true}});
    return mobileJson({success:true,data:{pk:p?videoPkDto(p):null}});
  } catch(e){return mobileApiError(e,"LIVE_PK_READ_FAILED")}
}
export async function POST(request,{params}) {
  try {
    const user=await requireMobileUser(request),{liveId}=await params,body=await request.json(),mode=videoPkMode(body.mode);
    await finalizeExpiredPkSessions();
    const p=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('video-pk-matching'))`;
      const left=await tx.videoLiveSession.findUnique({where:{publicId:liveId}}),right=await tx.videoLiveSession.findUnique({where:{publicId:String(body.opponentLiveId||"")}});
      if(!left||left.status!=="LIVE"||left.hostId!==user.id)throw videoError("LIVE_HOST_REQUIRED","Only a live host can invite an opponent.");
      if(!right||right.status!=="LIVE"||right.id===left.id||right.hostId===left.hostId)throw videoError("LIVE_NOT_FOUND","Opponent not available.",404);
      await requireVideoAccess(tx,right,user.id); await requireVideoAccess(tx,left,right.hostId);
      if(await pkConflict(tx,[left.id,right.id]))throw videoError("PK_CONFLICT","A live is already in PK.",409);
      await tx.videoLivePkQueue.deleteMany({where:{sessionId:{in:[left.id,right.id]}}});
      return tx.videoLivePkSession.create({data:{id:`VPK-${randomUUID()}`,mode,leftSessionId:left.id,rightSessionId:right.id},include:{leftSession:true,rightSession:true}});
    });
    const data=videoPkDto(p);
    for(const id of [data.leftLiveId,data.rightLiveId])await emitToVideoLive(id,"live-video:pk-invited",{success:true,data});
    return mobileJson({success:true,data},201);
  }catch(e){return mobileApiError(e,"LIVE_PK_CREATE_FAILED")}
}
export async function PATCH(request,{params}) {
  try {
    const user=await requireMobileUser(request),{liveId}=await params,body=await request.json();
    const updated=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('video-pk-matching'))`;
      const live=await tx.videoLiveSession.findUnique({where:{publicId:liveId}});
      if(!live||live.hostId!==user.id||live.status!=="LIVE")throw videoError("LIVE_HOST_REQUIRED","Only a live host can change PK.");
      const p=await tx.videoLivePkSession.findFirst({where:{id:String(body.pkId||""),OR:[{leftSessionId:live.id},{rightSessionId:live.id}]},include:{leftSession:true,rightSession:true}});
      if(!p)throw videoError("PK_NOT_FOUND","PK not found.",404);
      const action=String(body.action||"").toUpperCase(),now=new Date();let data={revision:{increment:1}};
      if(action==="ACCEPT"&&p.status==="PENDING"&&p.rightSessionId===live.id&&p.leftSession.status==="LIVE") {
        await requireVideoAccess(tx,p.leftSession,user.id);await requireVideoAccess(tx,p.rightSession,p.leftSession.hostId);
        data={...data,status:"LIVE",startedAt:now,endsAt:new Date(+now+Math.min(1800,Math.max(60,Number(body.durationSeconds)||300))*1000)};
      }else if(action==="REJECT"&&p.status==="PENDING")data={...data,status:"REJECTED",endedAt:now};
      else if(action==="END"&&["PENDING","LIVE"].includes(p.status))data={...data,status:"ENDED",endedAt:now,winnerLiveId:p.leftScore===p.rightScore?null:p.leftScore>p.rightScore?p.leftSession.publicId:p.rightSession.publicId};
      else throw videoError("PK_STATE_INVALID","Invalid PK state.",409);
      return tx.videoLivePkSession.update({where:{id:p.id},data,include:{leftSession:true,rightSession:true}});
    });
    const data=videoPkDto(updated);for(const id of [data.leftLiveId,data.rightLiveId])await emitToVideoLive(id,"live-video:pk-changed",{success:true,data});
    return mobileJson({success:true,data});
  }catch(e){return mobileApiError(e,"LIVE_PK_UPDATE_FAILED")}
}
