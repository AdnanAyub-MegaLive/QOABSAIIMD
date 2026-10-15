import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { amount, currencyPolicy, payoutQuote } from "./currency-policy.js";
import { diamondRules, validateServiceAmount, checkDiamondLimits, eligibleResellerWhere } from "./diamond-service-rules.js";
import { walletAgencyInclude, walletEligibility } from "./wallet-eligibility.js";
import { ledgerData } from "./wallet.js";
import { notifyAction } from "./action-notifications.js";

export const payoutFail=(code,message,status=409)=>{throw Object.assign(new Error(message),{code,status});};
const hash=value=>createHash("sha256").update(value).digest("hex");
const DAY=86400000;
// Reseller bank payouts have no commission or network deduction. Keep the
// existing valuation/limits, but never use the official USDT fee chart.
export function resellerPayoutQuote(diamonds, policy) {
 return payoutQuote(diamonds,{...policy,rules:{...policy.rules,feeBearer:"COMPANY",commissionChart:[{minUsdMicros:"0",bps:"0",fixedUsdtMicros:"0",networkUsdtMicros:"0"}]}});
}
function encryptionKey() {
 const key=process.env.PAYOUT_BANK_ENCRYPTION_KEY;
 if(!/^[a-fA-F0-9]{64}$/.test(key??""))payoutFail("PAYOUT_CONFIGURATION_INCOMPLETE","Private payout storage is not configured.",503);
 return Buffer.from(key,"hex");
}
export function encryptBank(bank) {
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);
 cipher.setAAD(Buffer.from("megalive-payout-bank-v1"));
 const bytes=Buffer.concat([cipher.update(JSON.stringify(bank)),cipher.final()]);
 return [iv,cipher.getAuthTag(),bytes].map(v=>v.toString("base64url")).join(".");
}
export function decryptBank(value) {
 const [iv,tag,bytes]=value.split(".").map(v=>Buffer.from(v,"base64url"));
 const cipher=createDecipheriv("aes-256-gcm",encryptionKey(),iv);
 cipher.setAAD(Buffer.from("megalive-payout-bank-v1"));cipher.setAuthTag(tag);
 return JSON.parse(Buffer.concat([cipher.update(bytes),cipher.final()]).toString());
}
export function normalizeBank(input) {
 const result={};
 for(const [key,max] of [["accountHolder",160],["bankName",160],["accountNumber",100],["otherDetails",500]]) {
  const value=input?.[key];
  if(value!==undefined&&typeof value!=="string")payoutFail("VALIDATION_ERROR","Bank details must be text.",422);
  const clean=(value??"").trim();
  if((key!=="otherDetails"&&!clean)||clean.length>max||/[\x00-\x1f]/.test(clean))payoutFail("VALIDATION_ERROR",`Provide valid ${key}.`,422);
  result[key]=clean;
 }
 return result;
}
function sign(payload) {
 if(!process.env.AUTH_SECRET)payoutFail("PAYOUT_CONFIGURATION_INCOMPLETE","Quote signing is unavailable.",503);
 return createHmac("sha256",process.env.AUTH_SECRET).update(payload).digest();
}
function quoteToken(data) {const body=Buffer.from(JSON.stringify(data)).toString("base64url");return `${body}.${sign(body).toString("base64url")}`;}
function verifyQuote(token,expected) {
 try {
  if(typeof token!=="string"||token.length>4096)throw Error();
  const [body,sig,extra]=token.split("."),actual=Buffer.from(sig,"base64url"),wanted=sign(body);
  if(extra||actual.length!==wanted.length||!timingSafeEqual(actual,wanted))throw Error();
  const data=JSON.parse(Buffer.from(body,"base64url").toString());
  if(data.purpose!=="RESELLER_ESCROW_FEE_FREE"||data.expires<=Date.now()||Object.entries(expected).some(([k,v])=>data[k]!==v))throw Error();
 }catch{payoutFail("CURRENCY_QUOTE_EXPIRED","Request a fresh quote and confirm the payout again.");}
}
async function eligible(tx,userId,diamonds,resellerPublicId) {
 const user=await tx.user.findUniqueOrThrow({where:{id:userId},include:walletAgencyInclude});
 const policy=await currencyPolicy(tx),rules=diamondRules(policy,user,"TRANSFER");
 validateServiceAmount(diamonds,rules,"TRANSFER");
 const reseller=await tx.user.findFirst({where:{...eligibleResellerWhere(user),publicId:resellerPublicId}});
 if(!reseller||!walletEligibility(reseller).transfer)payoutFail("RESELLER_INELIGIBLE","Choose an active eligible reseller in your country.",422);
 if(user.hostSalaryCoinBalance<diamonds)payoutFail("INSUFFICIENT_DIAMONDS","Insufficient Diamonds.");
 await checkDiamondLimits(tx,userId,diamonds,rules,"TRANSFER");
 return {user,reseller,policy,quote:resellerPayoutQuote(diamonds,policy)};
}
export async function escrowQuote(db,userId,input) {
 encryptionKey();
 const diamonds=amount(input.diamonds),bank=normalizeBank(input.bank);
 const {user,reseller,policy,quote}=await eligible(db,userId,diamonds,String(input.resellerPublicId??""));
 const expires=Date.now()+600000;
 return {diamonds:String(diamonds),resellerPublicId:reseller.publicId,country:user.country,...quote,policyVersion:policy.version,expiresAt:new Date(expires).toISOString(),quoteToken:quoteToken({purpose:"RESELLER_ESCROW_FEE_FREE",userId,resellerId:reseller.id,diamonds:String(diamonds),bankHash:hash(JSON.stringify(bank)),policyVersion:policy.version,country:user.country,expires})};
}
async function transaction(db,work) {
 for(let i=0;i<4;i++)try{return await db.$transaction(work,{isolationLevel:"Serializable",timeout:15000});}catch(e){if(!["P2034","P2002"].includes(e.code)||i===3)throw e;}
}
async function audit(tx,row,action,actorId,note) {
 await tx.auditLog.create({data:{action:`RESELLER_PAYOUT_${action}`,category:"FINANCE",entityType:"ResellerPayout",entityId:row.id,description:note??action,metadata:{actorId,status:row.status}}});
}
async function notify(tx,row,event,title,body) {
 for(const userId of [row.senderId,row.resellerId])await notifyAction(tx,{userId,key:`payout:${row.id}:${event}`,type:"DIAMOND_PAYOUT",title,body,action:{screen:"DIAMOND_PAYOUT",payoutId:row.id}});
}
export const payoutSelect={id:true,senderId:true,resellerId:true,diamonds:true,quote:true,policyVersion:true,hostSource:true,country:true,maskedBank:true,status:true,paymentDays:true,paymentDueAt:true,proofMimeType:true,proofUploadedAt:true,proofSubmittedAt:true,verifyDueAt:true,paymentReference:true,reviewReason:true,completedAt:true,cancelledAt:true,createdAt:true,updatedAt:true,sender:{select:{publicId:true,name:true,profileImage:true}},reseller:{select:{publicId:true,name:true,profileImage:true}}};
export function payoutDto(row,admin=false) {
 const {senderId:_s,resellerId:_r,hostSource:_h,bankCipher:_b,proofData:_p,fingerprint:_f,requestKey:_k,...safe}=row;
 return {...safe,diamonds:String(row.diamonds),overdueForReview:!["COMPLETED","CANCELLED"].includes(row.status)&&Date.now()-new Date(row.createdAt)>3*DAY,proofUrl:row.proofUploadedAt?`${admin?"/api/admin":"/api/v1"}/wallet/reseller-payouts/${row.id}/proof`:null};
}
export async function createEscrow(db,userId,input,key) {
 if(!/^[A-Za-z0-9._:-]{8,128}$/.test(key??""))payoutFail("INVALID_IDEMPOTENCY_KEY","Supply an Idempotency-Key.",422);
 const diamonds=amount(input.diamonds),bank=normalizeBank(input.bank),resellerPublicId=String(input.resellerPublicId??"");
 const fingerprint=hash(JSON.stringify({diamonds:String(diamonds),bank,resellerPublicId}));
 return transaction(db,async tx=>{
  const old=await tx.resellerPayout.findUnique({where:{senderId_requestKey:{senderId:userId,requestKey:key}}});
  if(old){if(old.fingerprint!==fingerprint)payoutFail("IDEMPOTENCY_CONFLICT","Key already used with different details.");return old.id;}
  const {user,reseller,policy,quote}=await eligible(tx,userId,diamonds,resellerPublicId);
  verifyQuote(input.quoteToken,{userId,resellerId:reseller.id,diamonds:String(diamonds),bankHash:hash(JSON.stringify(bank)),policyVersion:policy.version,country:user.country});
  const debit=await tx.user.updateMany({where:{id:userId,hostSalaryCoinBalance:{gte:diamonds}},data:{hostSalaryCoinBalance:{decrement:diamonds}}});
  if(!debit.count)payoutFail("INSUFFICIENT_DIAMONDS","Insufficient Diamonds.");
  const now=new Date();
  const row=await tx.resellerPayout.create({data:{senderId:userId,resellerId:reseller.id,requestKey:key,fingerprint,diamonds,quote,policyVersion:policy.version,country:user.country,bankCipher:encryptBank(bank),maskedBank:`${bank.bankName} •••• ${bank.accountNumber.slice(-4)}`,hostSource:Boolean(user.agencyId&&(user.role==="HOST"||user.appRoles.includes("HOST"))),createdAt:now,paymentDueAt:new Date(+now+3*DAY)}});
  await tx.walletTransaction.create({data:ledgerData({userId,type:"TRANSFER_SENT",direction:"DEBIT",diamonds,referenceId:row.id,title:"Diamonds held for reseller payout",metadata:{escrow:true,resellerId:reseller.publicId}})});
  await audit(tx,row,"CREATED",userId);
  await notify(tx,row,"CREATED","New Diamond Payout Request",`${user.name} (${user.publicId}): ${diamonds} Diamonds, pending. Payment details are available privately in the request.`);
  return row.id;
 });
}
export async function payoutAccess(db,id,actor,fullBank=false) {
 const row=await db.resellerPayout.findFirst({where:{id,...(actor.admin?{}:{OR:[{senderId:actor.id},{resellerId:actor.id}]})},select:payoutSelect});
 if(!row)payoutFail("NOT_FOUND","Payout not found.",404);
 const dto=payoutDto(row,actor.admin);
 if(fullBank&&(actor.admin||row.resellerId===actor.id)) {
  const secret=await db.resellerPayout.findUnique({where:{id},select:{bankCipher:true}});
  dto.bank=decryptBank(secret.bankCipher);
  await audit(db,row,"BANK_VIEWED",actor.id);
 }
 return dto;
}
async function settle(tx,row,release,actorId,reason) {
 if(release) {
  const reseller=await tx.user.findUnique({where:{id:row.resellerId}});
  if(!reseller?.appRoles.includes("RESELLER")||!walletEligibility(reseller).transfer)payoutFail("RESELLER_INELIGIBLE","Reseller is unavailable. Keep escrow held for support review.");
 }
 const userId=release?row.resellerId:row.senderId;
 const credited=await tx.user.updateMany({where:{id:userId,hostSalaryCoinBalance:{lte:9223372036854775807n-row.diamonds}},data:{hostSalaryCoinBalance:{increment:row.diamonds}}});
 if(!credited.count)payoutFail("BALANCE_LIMIT","Unable to credit balance; support review required.");
 const updated=await tx.resellerPayout.update({where:{id:row.id},data:{status:release?"COMPLETED":"CANCELLED",...(release?{completedAt:new Date()}:{cancelledAt:new Date()}),reviewReason:reason}});
 await tx.walletTransaction.create({data:ledgerData({userId,type:release?"TRANSFER_RECEIVED":"REFUND",direction:"CREDIT",diamonds:row.diamonds,referenceId:row.id,title:release?"Confirmed reseller payout Diamonds":"Cancelled escrow Diamonds refunded",metadata:{escrow:true,verifiedHostTransfer:release&&row.hostSource}})});
 await audit(tx,updated,release?"RELEASED":"REFUNDED",actorId,reason);
 await notify(tx,updated,updated.status,release?"Diamond Payout Completed":"Diamond Payout Cancelled",release?`${row.diamonds} Diamonds released after payment verification.`:`${row.diamonds} Diamonds refunded. ${reason}`);
 return updated;
}
export async function actOnPayout(db,id,actor,input) {
 return transaction(db,async tx=>{
  await tx.$queryRaw`SELECT id FROM "ResellerPayout" WHERE id=${id} FOR UPDATE`;
  const row=await tx.resellerPayout.findUnique({where:{id}});
  if(!row||(!actor.admin&&!actor.system&&![row.senderId,row.resellerId].includes(actor.id)))payoutFail("NOT_FOUND","Payout not found.",404);
  const now=new Date(),action=input.action;
  const reason=String(input.reason??"").trim();
  if(reason.length>1000)payoutFail("VALIDATION_ERROR","Reason is too long.",422);
  if(actor.system&&action==="EXPIRE") {
   if(row.status==="PENDING"&&row.paymentDueAt<=now) {
    const reseller=await tx.user.findUnique({where:{id:row.resellerId}});
    // Suspension never silently disposes of escrow; staff must decide.
    if(!reseller||!walletEligibility(reseller).transfer)return row.id;
    await settle(tx,row,false,"SYSTEM","Payment deadline expired without submitted proof.");
   }else if(row.status==="AWAITING_HOST"&&row.verifyDueAt<=now) {
    const updated=await tx.resellerPayout.update({where:{id},data:{status:"SUPPORT_REVIEW",reviewReason:"Host verification window expired."}});
    await audit(tx,updated,"VERIFICATION_TIMEOUT","SYSTEM");await notify(tx,updated,"REVIEW","Payout needs support review","The verification window expired. Diamonds remain held.");
   }
   return id;
  }
  if(!actor.admin){
   const user=await tx.user.findUnique({where:{id:actor.id}});
   if(!user||user.status!=="ACTIVE"||user.deletedAt)payoutFail("SESSION_REVOKED","Account unavailable.",401);
   if(actor.id===row.resellerId&&(!user.appRoles.includes("RESELLER")||!walletEligibility(user).transfer))payoutFail("FORBIDDEN","Reseller access is unavailable.",403);
  }
  if(action==="SET_DEADLINE"&&actor.id===row.resellerId) {
   if(![1,3,5].includes(input.days))payoutFail("VALIDATION_ERROR","Choose 1, 3 or 5 days.",422);
   if(row.paymentDays===input.days)return id;
   if(row.status!=="PENDING"||row.paymentDays||row.paymentDueAt<=now)payoutFail("INVALID_STATE","Payment window cannot be changed.");
   const due=new Date(+row.createdAt+input.days*DAY);
   if(due<=now)payoutFail("INVALID_STATE","That window has already elapsed.");
   await tx.resellerPayout.update({where:{id},data:{paymentDays:input.days,paymentDueAt:due}});
   await audit(tx,row,"DEADLINE_SELECTED",actor.id);
   await notify(tx,row,"DEADLINE","Payout payment window selected",`The reseller selected ${input.days} days from request creation, due ${due.toISOString()}.`);
  }else if(action==="SUBMIT_PROOF"&&actor.id===row.resellerId) {
   if(["AWAITING_HOST","SUPPORT_REVIEW","COMPLETED"].includes(row.status)&&row.proofSubmittedAt)return id;
   if(row.status!=="PENDING"||row.paymentDueAt<=now||!row.proofData||!row.paymentDays)payoutFail("INVALID_STATE","Select a payment window and upload proof before the deadline.");
   const reference=String(input.reference??"").trim();if(reference.length>160)payoutFail("VALIDATION_ERROR","Reference is too long.",422);
   await tx.resellerPayout.update({where:{id},data:{status:"AWAITING_HOST",proofSubmittedAt:now,verifyDueAt:new Date(+now+DAY),paymentReference:reference}});
   await audit(tx,row,"PROOF_SUBMITTED",actor.id);
   const reseller=await tx.user.findUnique({where:{id:row.resellerId},select:{name:true,publicId:true}});
   await notify(tx,row,"PROOF","Diamond Payout Processed",`${reseller.name} (${reseller.publicId}): ${row.diamonds} Diamonds, ${Number(row.quote.netUsdtMicros)/1000000} USDT. Proof attached. Confirm receipt or report non-receipt within 24 hours. Diamonds remain held.`);
  }else if(["CONFIRM_RECEIPT","DISPUTE"].includes(action)&&actor.id===row.senderId) {
   if(action==="CONFIRM_RECEIPT"&&row.status==="COMPLETED")return id;
   if(action==="DISPUTE"&&row.status==="SUPPORT_REVIEW")return id;
   if(row.status!=="AWAITING_HOST"||row.verifyDueAt<=now)payoutFail("INVALID_STATE","Host verification is closed; support must resolve this payout.");
   if(action==="CONFIRM_RECEIPT")await settle(tx,row,true,actor.id,"Host confirmed payment receipt.");
   else {
    if(!reason)payoutFail("VALIDATION_ERROR","Provide a dispute reason.",422);
    const updated=await tx.resellerPayout.update({where:{id},data:{status:"SUPPORT_REVIEW",reviewReason:reason}});
    await audit(tx,updated,"DISPUTED",actor.id,reason);await notify(tx,updated,"REVIEW","Payout disputed","Payment is disputed. Diamonds remain held for support review.");
   }
  }else if(actor.admin&&action==="REASSIGN") {
   if(row.status!=="PENDING"||!reason)payoutFail("INVALID_STATE","Only pending payouts can be reassigned with a reason.");
   const next=await tx.user.findFirst({where:{...eligibleResellerWhere({id:row.senderId,country:row.country}),publicId:String(input.resellerPublicId??"")}});
   if(!next||!walletEligibility(next).transfer)payoutFail("RESELLER_INELIGIBLE","Choose an eligible same-country reseller.",422);
   if(next.id===row.resellerId)return id;
   const updated=await tx.resellerPayout.update({where:{id},data:{resellerId:next.id,paymentDays:null,proofData:null,proofMimeType:null,proofUploadedAt:null,reviewReason:reason}});
   await audit(tx,updated,"REASSIGNED",actor.id,reason);
   await notifyAction(tx,{userId:row.resellerId,key:`payout:${id}:removed:${row.resellerId}`,type:"DIAMOND_PAYOUT",title:"Payout reassigned",body:"Support reassigned this payout. You no longer have access to payment details.",action:{screen:"WALLET"}});
   await notify(tx,updated,`REASSIGNED:${next.id}`,"Payout reassigned","Support changed the reseller. The original payment deadline is unchanged.");
  }else if(actor.admin&&["CANCEL","RESOLVE_REFUND","RESOLVE_RELEASE"].includes(action)) {
   const release=action==="RESOLVE_RELEASE";
   if(row.status===(release?"COMPLETED":"CANCELLED"))return id;
   if(!reason)payoutFail("VALIDATION_ERROR","Provide a resolution reason.",422);
   if(action==="CANCEL"?row.status!=="PENDING":row.status!=="SUPPORT_REVIEW")payoutFail("INVALID_STATE","This action is not permitted in the current state.");
   await settle(tx,row,release,actor.id,reason);
  }else payoutFail("INVALID_STATE","Action is not permitted.");
  return id;
 });
}
export async function expirePayouts(db) {
 const now=new Date();
 const rows=await db.resellerPayout.findMany({where:{OR:[{status:"PENDING",paymentDueAt:{lte:now},reseller:{status:"ACTIVE",deletedAt:null,appRoles:{has:"RESELLER"},NOT:{appRoles:{hasSome:["CS","CS_LEADER"]}}}},{status:"AWAITING_HOST",verifyDueAt:{lte:now}}]},select:{id:true},take:200,orderBy:{updatedAt:"asc"}});
 for(const row of rows)try{await actOnPayout(db,row.id,{system:true},{action:"EXPIRE"});}catch{console.error("Payout deadline requires retry or manual review",row.id);}
}
export async function uploadPayoutProof(db,id,actor,bytes,mimeType) {
 return transaction(db,async tx=>{
  await tx.$queryRaw`SELECT id FROM "ResellerPayout" WHERE id=${id} FOR UPDATE`;
  const row=await tx.resellerPayout.findUnique({where:{id}});
  if(!row||row.resellerId!==actor.id)payoutFail("NOT_FOUND","Payout not found.",404);
  const user=await tx.user.findUnique({where:{id:actor.id}});
  if(!user?.appRoles.includes("RESELLER")||!walletEligibility(user).transfer)payoutFail("FORBIDDEN","Reseller access unavailable.",403);
  if(row.status!=="PENDING"||row.paymentDueAt<=new Date())payoutFail("INVALID_STATE","Proof can only be uploaded before the payment deadline.");
  await tx.resellerPayout.update({where:{id},data:{proofData:bytes,proofMimeType:mimeType,proofUploadedAt:new Date()}});
  await audit(tx,row,"PROOF_UPLOADED",actor.id);
 });
}
