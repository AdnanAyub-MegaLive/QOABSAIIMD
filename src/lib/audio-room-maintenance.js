import { prisma } from "./prisma.js";

export async function reconcileExpiredAudioRoomRestrictions(roomId){
  const now=new Date();
  const scope=roomId?{roomId}:{};
  const [joining,blocked,terminated]=await prisma.$transaction([
    prisma.audioRoom.updateMany({where:{...scope,joiningDisabled:true,joiningDisabledUntil:{lte:now}},data:{joiningDisabled:false,joiningDisabledUntil:null,revision:{increment:1}}}),
    prisma.audioRoom.updateMany({where:{...scope,isBlocked:true,blockedUntil:{lte:now}},data:{isBlocked:false,blockedUntil:null,blockedReason:null,status:"IDLE"}}),
    prisma.audioRoom.updateMany({where:{...scope,status:"TERMINATED",terminatedUntil:{lte:now}},data:{status:"IDLE",terminatedUntil:null}}),
  ]);
  return {joiningEnabled:joining.count,unblocked:blocked.count,restored:terminated.count};
}
