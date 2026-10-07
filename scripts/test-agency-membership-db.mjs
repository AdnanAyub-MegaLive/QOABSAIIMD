import {config} from "dotenv";
import {randomUUID} from "node:crypto";
import assert from "node:assert/strict";
config({path:".env.local",quiet:true});
const {prisma}=await import("../src/lib/prisma.js");
const {createMembership,respondMembership}=await import("../src/lib/agency-membership.js");
const rollback=new Error("ROLLBACK_TEST");
try{await prisma.$transaction(async tx=>{
 const db=new Proxy(tx,{get:(o,k)=>k==="$transaction"?fn=>fn(tx):o[k]});
 const owner=await tx.user.create({data:{publicId:`USR-${randomUUID().replaceAll("-","")}`,name:"Agency test owner"}});
 const agency=await tx.agency.create({data:{publicId:`AGN-${randomUUID()}`,name:"Membership test",ownerUserId:owner.id,status:"ACTIVE"}});
 for(const invite of [false,true]){
  const user=await tx.user.create({data:{publicId:`USR-${randomUUID().replaceAll("-","")}`,name:"Membership test user",isVerified:false}});
  const offer=await createMembership(invite?owner.id:user.id,{agencyId:agency.publicId,userPublicId:user.publicId,invite},db);
  await assert.rejects(respondMembership(invite?owner.id:user.id,offer.requestId,true,db));
  const result=await respondMembership(invite?user.id:owner.id,offer.requestId,true,db);
  const updated=await tx.user.findUnique({where:{id:user.id}});
  assert.equal(updated.isVerified,false);assert.equal(updated.agencyId,agency.id);assert.ok(updated.appRoles.includes("HOST"));assert.ok(result.userId.startsWith("TLN-"));
  await assert.rejects(respondMembership(invite?user.id:owner.id,offer.requestId,true,db));
 }
 throw rollback;
},{isolationLevel:"Serializable",timeout:15000});}catch(e){if(e!==rollback)throw e;console.log("PASS: both consent directions, unauthorized responders, host promotion without KYC and duplicate approval; fixtures rolled back.");}finally{await prisma.$disconnect();}
