import {config} from "dotenv";import {randomUUID} from "node:crypto";import assert from "node:assert/strict";
config({path:".env.local",quiet:true});
const {prisma}=await import("../src/lib/prisma.js");
const {issueManagementHandoff,consumeManagementHandoff,browserManagementUser}=await import("../src/lib/management-web.js");
const {moderateCountryTarget}=await import("../src/lib/management-moderation.js");
try{await prisma.$transaction(async tx=>{
 const owner=await tx.user.create({data:{publicId:`TEST-${randomUUID()}`,name:"Management test",country:"PK",appRoles:["SUPER_ADMIN"]}});
 const target=await tx.user.create({data:{publicId:`TEST-${randomUUID()}`,name:"Target test",country:"PK"}});
 const db=new Proxy(tx,{get:(obj,key)=>key==="$transaction"?work=>work(tx):obj[key]});
 const link=await issueManagementHandoff(owner,{sessionVersion:owner.sessionVersion,issuedAt:Date.now(),exp:Math.floor(Date.now()/1000)+3600},db);
 const ticket=new URLSearchParams(new URL(link.url).hash.slice(1)).get("ticket");
 const token=await consumeManagementHandoff(ticket,db);
 assert.equal((await browserManagementUser(token,db)).id,owner.id);
 await assert.rejects(consumeManagementHandoff(ticket,db));
 await moderateCountryTarget(owner.id,{type:"USER",action:"BAN",publicId:target.publicId,reason:"Test",durationMinutes:60},db);
 assert.equal((await tx.user.findUnique({where:{id:target.id}})).status,"BANNED");
 await moderateCountryTarget(owner.id,{type:"USER",action:"UNBAN",publicId:target.publicId,reason:"Test complete"},db);
 assert.equal((await tx.user.findUnique({where:{id:target.id}})).status,"ACTIVE");
 await tx.user.update({where:{id:owner.id},data:{appRoles:["ADMIN"]}});
 await assert.rejects(browserManagementUser(token,db));
 throw Error("ROLLBACK_SUCCESS");
},{timeout:15000,isolationLevel:"Serializable"});}catch(e){if(e.message!=="ROLLBACK_SUCCESS")throw e;console.log("PASS: single-use login, browser authorization, ban/unban and role revocation; all fixtures rolled back.");}finally{await prisma.$disconnect();}
