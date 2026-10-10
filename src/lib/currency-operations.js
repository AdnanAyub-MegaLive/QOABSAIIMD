import { verifyWithdrawalQuote } from "./withdrawal-contract.js";
import { createHash } from "node:crypto";
import { currencyPolicy, amount, currencyError, payoutQuote } from "./currency-policy.js";
import { ledgerData } from "./wallet.js";
export const isHost=user=>Boolean(user.agencyId&&(user.role==="HOST"||user.appRoles?.includes("HOST")));
const isReseller=user=>user.appRoles?.includes("RESELLER");
export const serializeCurrencyRequest=row=>JSON.parse(JSON.stringify(row,(_,v)=>typeof v==="bigint"?String(v):v));
export function currencyRequestDto(row) {
  const {fingerprint:_fingerprint,idempotencyKey:_key,...result}=serializeCurrencyRequest(row);
  return {...result,quote:result.policySnapshot?.quote??null,rejectionReason:row.status==="REJECTED"?row.reviewNote:null,canCancel:row.status==="PENDING"&&row.kind!=="RESELLER_TRANSFER"};
}
export function validTronAddress(value) {
  if(!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value))return false;
  const alphabet="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n=0n;for(const c of value)n=n*58n+BigInt(alphabet.indexOf(c));
  const bytes=Buffer.from(n.toString(16).padStart(50,"0"),"hex");
  if(bytes.length!==25||bytes[0]!==0x41)return false;
  const checksum=createHash("sha256").update(createHash("sha256").update(bytes.subarray(0,21)).digest()).digest().subarray(0,4);
  return checksum.equals(bytes.subarray(21));
}
async function transaction(db,work) {
  for(let i=0;i<4;i++)try{return await db.$transaction(work,{isolationLevel:"Serializable"});}catch(e){if(!["P2034","P2002"].includes(e.code)||i===3)throw e;}
}
export async function createCurrencyRequest(db,userId,input,key) {
  if(!/^[A-Za-z0-9._:-]{8,128}$/.test(key??""))throw currencyError("An Idempotency-Key is required.","INVALID_IDEMPOTENCY_KEY");
  const kind=String(input.kind??""),diamonds=amount(input.diamonds),recipientPublicId=String(input.recipientPublicId??"").trim(),destination=String(input.destination??"").trim();
  if(!["USDT","REDEMPTION","RESELLER_TRANSFER"].includes(kind))throw currencyError("Invalid request type.");
  const fingerprint=createHash("sha256").update(JSON.stringify({kind,diamonds:String(diamonds),recipientPublicId,destination})).digest("hex");
  return transaction(db,async tx=>{
    const previous=await tx.currencyRequest.findUnique({where:{userId_idempotencyKey:{userId,idempotencyKey:key}}});
    if(previous){if(previous.fingerprint!==fingerprint)throw currencyError("Idempotency key already used with different details.","IDEMPOTENCY_CONFLICT");return serializeCurrencyRequest(previous);}
    const user=await tx.user.findUniqueOrThrow({where:{id:userId}});
    if(user.status!=="ACTIVE"||user.deletedAt)throw currencyError("Account is not active.","SESSION_REVOKED");
    const policy=await currencyPolicy(tx),r=policy.rules;
    if(input.policyVersion!==undefined&&input.policyVersion!==policy.version)throw currencyError("Rates changed. Request a new quote before submitting.","CURRENCY_QUOTE_EXPIRED");
    let quotedCoins=0n,netUsdtMicros=0n,quote=null,recipient=null;
    if(kind==="REDEMPTION"){
      if(!isReseller(user)||!r.redemptionEnabled)throw currencyError("Reseller redemption is unavailable.","REDEMPTION_DISABLED");
      const gross=diamonds/BigInt(r.redemptionDiamondsPerCoin);
      quotedCoins=gross*(10000n-BigInt(r.redemptionDeductionBps))/10000n;
      if(quotedCoins<=0n)throw currencyError("The amount is too small after deductions.");
    }else{
      if(!isHost(user))throw currencyError("Only agency-linked hosts may cash out Diamonds.","WITHDRAWAL_NOT_ALLOWED");
      if(kind==="USDT"){
        if (!Number.isInteger(input.policyVersion) || input.policyVersion !== policy.version) throw currencyError("Request and confirm a fresh quote.", "CURRENCY_QUOTE_EXPIRED");
        verifyWithdrawalQuote(input.quoteToken,{userId,diamonds,destination,policyVersion:policy.version});
        if(!validTronAddress(destination))throw currencyError("Enter a valid TRON TRC20 destination address.");
        quote=payoutQuote(diamonds,policy);netUsdtMicros=BigInt(quote.netUsdtMicros);
      }else{
        if(!r.hostTransferEnabled)throw currencyError("Reseller transfers are disabled.");
        recipient=await tx.user.findUnique({where:{publicId:recipientPublicId}});
        if(!recipient||recipient.id===userId||recipient.deletedAt||recipient.status!=="ACTIVE"||!isReseller(recipient))throw currencyError("Select an active reseller other than yourself.");
      }
    }
    const reserved=await tx.user.updateMany({where:{id:userId,hostSalaryCoinBalance:{gte:diamonds}},data:{hostSalaryCoinBalance:{decrement:diamonds}}});
    if(!reserved.count)throw new Error("INSUFFICIENT_DIAMONDS");
    const row=await tx.currencyRequest.create({data:{userId,kind,idempotencyKey:key,fingerprint,diamonds,quotedCoins,netUsdtMicros,recipientPublicId:recipient?.publicId??null,destination:kind==="USDT"?destination:null,status:recipient?"PENDING_EXTERNAL":"PENDING",policySnapshot:serializeCurrencyRequest({...policy,quote})}});
    await tx.walletTransaction.create({data:ledgerData({userId,type:recipient?"TRANSFER_SENT":"WITHDRAWAL",direction:"DEBIT",title:recipient?"Diamonds sent to reseller":"Diamonds reserved for review",diamonds,referenceId:row.id,metadata:{kind,policyVersion:policy.version}})});
    if(recipient){
      const credited=await tx.user.updateMany({where:{id:recipient.id,hostSalaryCoinBalance:{lte:9223372036854775807n-diamonds}},data:{hostSalaryCoinBalance:{increment:diamonds}}});
      if(!credited.count)throw currencyError("Recipient balance limit exceeded.");
      await tx.walletTransaction.create({data:ledgerData({userId:recipient.id,type:"TRANSFER_RECEIVED",direction:"CREDIT",title:"Host Diamonds received; external payment pending",diamonds,referenceId:row.id,metadata:{senderId:user.publicId,policyVersion:policy.version}})});
    }
    await tx.auditLog.create({data:{action:"CURRENCY_REQUEST_CREATED",category:"FINANCE",entityType:"CurrencyRequest",entityId:row.id,description:`${user.publicId}: ${kind}`,metadata:{diamonds:String(diamonds),policyVersion:policy.version}}});
    return serializeCurrencyRequest(row);
  });
}
export async function updateOwnCurrencyRequest(db,userId,id,action){
  return transaction(db,async tx=>{
    const row=await tx.currencyRequest.findFirst({where:{id,userId}});
    if(!row)throw currencyError("Request not found.");
    if(action==="CONFIRM_EXTERNAL"&&row.kind==="RESELLER_TRANSFER"){
      if(row.status==="COMPLETED")return serializeCurrencyRequest(row);
      if(row.status!=="PENDING_EXTERNAL")throw currencyError("Request cannot be confirmed.");
    }else if(action==="CANCEL"&&row.kind!=="RESELLER_TRANSFER"){
      if(row.status==="CANCELLED")return serializeCurrencyRequest(row);
      if(row.status!=="PENDING")throw currencyError("Only pending requests may be cancelled.");
      const credited=await tx.user.updateMany({where:{id:userId,hostSalaryCoinBalance:{lte:9223372036854775807n-row.diamonds}},data:{hostSalaryCoinBalance:{increment:row.diamonds}}});
      if(!credited.count)throw currencyError("Balance limit prevents cancellation.");
      await tx.walletTransaction.create({data:ledgerData({userId,type:"REFUND",direction:"CREDIT",title:"Cancelled Diamond request refunded",diamonds:row.diamonds,referenceId:row.id})});
    }else throw currencyError("Invalid action.");
    const result=await tx.currencyRequest.update({where:{id},data:{status:action==="CANCEL"?"CANCELLED":"COMPLETED",...(action==="CANCEL"?{cancelledAt:new Date()}:{})}});
    await tx.auditLog.create({data:{action:`CURRENCY_${action}`,category:"FINANCE",entityType:"CurrencyRequest",entityId:id,description:`Account ${userId} confirmed ${action}`}});
    return serializeCurrencyRequest(result);
  });
}
export async function reviewCurrencyRequest(db,admin,id,action,note,hash,paymentVerified=false) {
  if(!["APPROVE","REJECT","MARK_PAID"].includes(action)||!String(note??"").trim()||String(note).length>1000)throw currencyError("Choose an action and provide a review note (up to 1000 characters).");
  return transaction(db,async tx=>{
    const row=await tx.currencyRequest.findUniqueOrThrow({where:{id}});
    if(!["PENDING","APPROVED"].includes(row.status))throw currencyError("This request has already been resolved.");
    let status;
    if(action==="REJECT"){
      status="REJECTED";
      const refunded=await tx.user.updateMany({where:{id:row.userId,hostSalaryCoinBalance:{lte:9223372036854775807n-row.diamonds}},data:{hostSalaryCoinBalance:{increment:row.diamonds}}});
      if(!refunded.count)throw currencyError("Balance limit prevents refund; manual review required.");
      await tx.walletTransaction.create({data:ledgerData({userId:row.userId,type:"REFUND",direction:"CREDIT",title:"Rejected Diamond request refunded",diamonds:row.diamonds,referenceId:row.id})});
    }else if(action==="APPROVE"){
      if(row.status!=="PENDING")throw currencyError("Request is already approved.");
      status="APPROVED";
      if(row.kind==="REDEMPTION"){
        const credited=await tx.user.updateMany({where:{id:row.userId,coinBalance:{lte:9223372036854775807n-row.quotedCoins}},data:{coinBalance:{increment:row.quotedCoins}}});
        if(!credited.count)throw currencyError("Coin balance limit exceeded.");
        await tx.walletTransaction.create({data:ledgerData({userId:row.userId,type:"DIAMOND_EXCHANGE_CREDIT",direction:"CREDIT",title:"Approved reseller Diamond redemption",coins:row.quotedCoins,referenceId:row.id,metadata:{policy:row.policySnapshot}})});
        status="COMPLETED";
      }
    }else{
      if(paymentVerified!==true||row.kind!=="USDT"||row.status!=="APPROVED"||! /^[a-fA-F0-9]{64}$/.test(hash??""))throw currencyError("Approve first, verify the payment and supply the 64-character TRON transaction hash.");
      status="COMPLETED";
    }
    const updated=await tx.currencyRequest.update({where:{id},data:{status,reviewedBy:admin.id,reviewNote:note,...(action==="APPROVE"?{approvedAt:new Date()}:{}),...(action==="REJECT"?{rejectedAt:new Date()}:{}),...(action==="MARK_PAID"?{payoutHash:hash.toLowerCase(),paidAt:new Date(),paymentVerifiedAt:new Date()}: {})}});
    await tx.auditLog.create({data:{adminId:admin.id,action:`CURRENCY_${action}`,category:"FINANCE",entityType:"CurrencyRequest",entityId:id,description:note,metadata:{status}}});
    return serializeCurrencyRequest(updated);
  });
}
