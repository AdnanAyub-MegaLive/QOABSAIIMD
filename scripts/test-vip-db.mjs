import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({path:".env.local",quiet:true});
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const {prisma}=await import("../src/lib/prisma.js");
const {getVipMembership}=await import("../src/lib/vip-membership.js");
const rollback=new Error("ROLLBACK_VIP_TEST");
try{
 await prisma.$transaction(async tx=>{
  const user=await tx.user.create({data:{publicId:`VIPTEST-${randomUUID()}`,name:"VIP test"}});
  const tier=await tx.vipTier.create({data:{name:"VIP test",level:2147483000,validDays:30,privileges:["VIP_FRAME"]}});
  const asset=await tx.uploadAsset.create({data:{publicId:`AST-${randomUUID()}`,name:"Test frame",category:"FRAMES",mimeType:"image/png",fileName:"test.png",fileSize:1,fileData:Buffer.from([0]),isGlobal:false}});
  await tx.vipBenefitAsset.create({data:{tierId:tier.id,privilege:"VIP_FRAME",assetId:asset.id}});
  await tx.vipMembership.create({data:{userId:user.id,tierId:tier.id,expiresAt:new Date(Date.now()+86400000)}});
  const vip=await getVipMembership(user.id,"https://portal.example",tx);
  assert.equal(vip.level,tier.level);assert.equal(vip.assets[0].assetId,asset.publicId);assert.ok(vip.assets[0].url.startsWith("https://portal.example/api/uploads/"));
  await tx.vipTier.update({where:{id:tier.id},data:{active:false}});assert.equal(await getVipMembership(user.id,"https://portal.example",tx),null);
  await tx.vipTier.update({where:{id:tier.id},data:{active:true}});
  await tx.vipMembership.update({where:{userId:user.id},data:{expiresAt:new Date(0)}});assert.equal(await getVipMembership(user.id,"https://portal.example",tx),null);
  throw rollback;
 });
}catch(error){if(error!==rollback)throw error;}finally{await prisma.$disconnect();}
console.log("VIP database checks passed; fixtures rolled back.");
