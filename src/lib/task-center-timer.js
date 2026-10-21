import { addDailyTaskProgress } from "./daily-tasks.js";
// Conservative 15-second samples. No time is invented across restarts or missed ticks.
export function createTaskTimer(db,io){
 let running=false;
 return async(now=new Date())=>{
  if(running)return;running=true;
  try{
   if(!await db.dailyTaskDefinition.count({where:{active:true,deletedAt:null,metric:"ON_MIC",category:{active:true}}}))return;
   const end=new Date(Math.floor(now.getTime()/15000)*15000),start=new Date(end.getTime()-15000);
   const seats=await db.audioRoomSeat.findMany({where:{occupantUserId:{not:null},occupiedAt:{lte:start},audioRoom:{status:"LIVE",isBlocked:false}},select:{occupantUserId:true,audioRoom:{select:{roomId:true}}}});
   const seen=new Set();
   for(const seat of seats){
    const userId=seat.occupantUserId;if(seen.has(userId))continue;
    const connected=[...io.sockets.sockets.values()].some(s=>s.data?.internalUserId===userId&&s.rooms.has(`audio-room:${seat.audioRoom.roomId}`)&&s.data.audioRoomTaskTimers?.get(seat.audioRoom.roomId)?.startedAt<=start.getTime());
    if(!connected)continue;seen.add(userId);
    try{await db.$transaction(async tx=>{
     const user=await tx.user.findUnique({where:{id:userId},select:{status:true,deletedAt:true}});if(!user||user.status!=="ACTIVE"||user.deletedAt)return;
     const cursor=await tx.taskTimerCursor.findUnique({where:{userId}});if(cursor?.sampledAt>=end)return;
     await tx.taskTimerCursor.upsert({where:{userId},create:{userId,sampledAt:end},update:{sampledAt:end}});
     await addDailyTaskProgress(userId,"ON_MIC",15,start,tx);
    },{isolationLevel:"Serializable"});}catch(e){if(!["P2034","P2002"].includes(e.code))throw e;}
   }
  }finally{running=false;}
 };
}
