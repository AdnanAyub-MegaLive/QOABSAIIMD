import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
config({path:".env.local",quiet:true});
const {prisma}=await import("../src/lib/prisma.js");
const {awardGiftProgress}=await import("../src/lib/progression.js");
try {
  await prisma.$transaction(async tx=>{
    await tx.progressionConfiguration.updateMany({data:{active:false}});
    const rules=[{track:"USER",source:"PAID",recipientType:"ANY",basis:"COST",numerator:"1",denominator:"1",allowSelf:false},{track:"CHARM",source:"PAID",recipientType:"NORMAL_USER",basis:"CREDIT",numerator:"1",denominator:"2",allowSelf:false}];
    await tx.progressionConfiguration.create({data:{active:true,enabled:true,rules,levels:{create:["USER","CHARM"].flatMap(track=>[0,1,2].map(level=>({track,level,thresholdPoints:BigInt(level*100),benefits:[]})))}}});
    const sender=await tx.user.create({data:{publicId:`TEST-${randomUUID()}`,name:"Progression test"}}),recipient=await tx.user.create({data:{publicId:`TEST-${randomUUID()}`,name:"Progression test"}});
    const input={sender,recipient,gift:{id:randomUUID()},source:"PAID",gross:250n,credit:101n,recipientType:"NORMAL_USER",origin:null};
    const result=await awardGiftProgress(tx,input);
    assert.equal(result.level,2);assert.deepEqual(result.levelsGained,[1,2]);
    await awardGiftProgress(tx,input);
    assert.equal(await tx.progressLedger.count({where:{userId:{in:[sender.id,recipient.id]}}}),2);
    const charm=await tx.userProgress.findUnique({where:{userId_track:{userId:recipient.id,track:"CHARM"}}});
    assert.equal(charm.lifetimePoints,50n);
    assert.equal(await tx.realtimeOutbox.count({where:{channel:{in:[`user:${sender.publicId}`,`user:${recipient.publicId}`]}}}),2);
    throw new Error("ROLLBACK_TEST_SUCCESS");
  },{isolationLevel:"Serializable",timeout:20000});
}catch(error){if(error.message!=="ROLLBACK_TEST_SUCCESS")throw error;console.log("PASS: progression ledger, integer rounding, level jumps, duplicate source prevention and outbox. All fixtures rolled back.");}
finally{await prisma.$disconnect();}
