import { verifyWithdrawalQuote } from "./withdrawal-contract.js";
import { redemptionCoins, redeemableHostDiamonds } from "./reseller-redemption.js";
import { walletEligibility, walletAgencyInclude } from "./wallet-eligibility.js";
import { notifyAction } from "./action-notifications.js";
import { createHash } from "node:crypto";
import { currencyPolicy, amount, currencyError, payoutQuote } from "./currency-policy.js";
import { ledgerData } from "./wallet.js";
import { diamondRules, validateServiceAmount, checkDiamondLimits, eligibleResellerWhere, activeSpecialIdWhere, serviceError } from "./diamond-service-rules.js";
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
    const user=await tx.user.findUniqueOrThrow({where:{id:userId},include:walletAgencyInclude});
    if(user.status!=="ACTIVE"||user.deletedAt)throw currencyError("Account is not active.","SESSION_REVOKED");
    const policy=await currencyPolicy(tx),r=policy.rules;
    if(input.policyVersion!==undefined&&input.policyVersion!==policy.version)throw currencyError("Rates changed. Request a new quote before submitting.","CURRENCY_QUOTE_EXPIRED");
    let quotedCoins=0n,netUsdtMicros=0n,quote=null,recipient=null;
    if(kind==="REDEMPTION"){
      if(!isReseller(user)||!walletEligibility(user).withdraw||!r.redemptionEnabled)throw currencyError("Reseller redemption is unavailable.","REDEMPTION_DISABLED");
      if (diamonds > await redeemableHostDiamonds(tx,userId)) throw currencyError("Only unspent, verified Host-transfer Diamonds can be redeemed. Older unverified balances require review.","REDEMPTION_SOURCE_INELIGIBLE");
      quotedCoins=redemptionCoins(diamonds,r);
      r.redemptionHostSourceRequired=true;
      if(quotedCoins>9223372036854775807n)throw currencyError("Redemption exceeds the supported amount.");
      if(quotedCoins<=0n)throw currencyError("The amount is too small after deductions.");
    }else{
      if(!walletEligibility(user)[kind==="USDT"?"withdraw":"transfer"])throw currencyError("This account is not eligible to transfer or withdraw Diamonds. Ordinary users, CS and CS Leaders can only Exchange.","WITHDRAWAL_NOT_ALLOWED");
      if(kind==="USDT"){
        if (!Number.isInteger(input.policyVersion) || input.policyVersion !== policy.version) throw currencyError("Request and confirm a fresh quote.", "CURRENCY_QUOTE_EXPIRED");
        verifyWithdrawalQuote(input.quoteToken,{userId,diamonds,destination,policyVersion:policy.version});
        if(!validTronAddress(destination))throw currencyError("Enter a valid TRON TRC20 destination address.");
        quote=payoutQuote(diamonds,policy);netUsdtMicros=BigInt(quote.netUsdtMicros);
      }else{
        const rules = diamondRules(policy, user, "TRANSFER");
        validateServiceAmount(diamonds, rules, "TRANSFER");
        recipient=await tx.user.findFirst({where:{OR:[{publicId:recipientPublicId},{specialIds:{some:{...activeSpecialIdWhere(),specialId:recipientPublicId}}}]}});
        if (recipient && recipient.country !== user.country) throw serviceError("TRANSFER_COUNTRY_MISMATCH", "Choose a reseller from your account country.");
        if(!recipient || !await tx.user.findFirst({where:{AND:[eligibleResellerWhere(user),{id:recipient.id}]},select:{id:true}})) throw serviceError("RESELLER_INELIGIBLE", "Select an active, eligible reseller other than yourself.", 409);
        await checkDiamondLimits(tx, userId, diamonds, rules, "TRANSFER");
      }
    }
    const reserved=await tx.user.updateMany({where:{id:userId,hostSalaryCoinBalance:{gte:diamonds}},data:{hostSalaryCoinBalance:{decrement:diamonds}}});
    if(!reserved.count)throw new Error("INSUFFICIENT_DIAMONDS");
    const row=await tx.currencyRequest.create({data:{userId,kind,idempotencyKey:key,fingerprint,diamonds,quotedCoins,netUsdtMicros,recipientPublicId:recipient?.publicId??null,destination:kind==="USDT"?destination:null,status:recipient?"PENDING_EXTERNAL":"PENDING",policySnapshot:serializeCurrencyRequest({...policy,quote})}});
    await tx.walletTransaction.create({data:ledgerData({userId,type:recipient?"TRANSFER_SENT":"WITHDRAWAL",direction:"DEBIT",title:recipient?"Diamonds sent to reseller":"Diamonds reserved for review",diamonds,referenceId:row.id,metadata:{kind,policyVersion:policy.version}})});
    if(recipient){
      const credited=await tx.user.updateMany({where:{id:recipient.id,hostSalaryCoinBalance:{lte:9223372036854775807n-diamonds}},data:{hostSalaryCoinBalance:{increment:diamonds}}});
      if(!credited.count)throw currencyError("Recipient balance limit exceeded.");
      await tx.walletTransaction.create({data:ledgerData({userId:recipient.id,type:"TRANSFER_RECEIVED",direction:"CREDIT",title:"Diamonds received; external payment pending",diamonds,referenceId:row.id,metadata:{senderId:user.publicId,policyVersion:policy.version,verifiedHostTransfer:Boolean(user.agencyId&&(user.role==="HOST"||user.appRoles?.includes("HOST")))}})});
    }
    await tx.auditLog.create({data:{action:"CURRENCY_REQUEST_CREATED",category:"FINANCE",entityType:"CurrencyRequest",entityId:row.id,description:`${user.publicId}: ${kind}`,metadata:{diamonds:String(diamonds),policyVersion:policy.version}}});
    await notifyAction(tx,{userId,key:`currency:${row.id}:created`,type:"CURRENCY_REQUEST",title:recipient?"Diamonds transferred":"Withdrawal request submitted",body:recipient?`${diamonds} Diamonds sent to the reseller. External payment is pending.`:`${diamonds} Diamonds reserved for review.`,action:{screen:"WALLET",requestId:row.id}});
    if(recipient)await notifyAction(tx,{userId:recipient.id,key:`currency:${row.id}:received`,type:"DIAMOND_TRANSFER",title:"Diamonds received",body:`${diamonds} Diamonds received from ${user.name}. External settlement is pending.`,action:{screen:"WALLET",requestId:row.id}});
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
      await tx.walletTransaction.create({data:ledgerData({userId,type:"REFUND",direction:"CREDIT",title:"Cancelled Diamond request refunded",diamonds:row.diamonds,referenceId:row.id,metadata:row.kind==="REDEMPTION"&&row.policySnapshot?.rules?.redemptionHostSourceRequired?{restoredHostDiamonds:String(row.diamonds)}:{}})});
    }else throw currencyError("Invalid action.");
    const result=await tx.currencyRequest.update({where:{id},data:{status:action==="CANCEL"?"CANCELLED":"COMPLETED",...(action==="CANCEL"?{cancelledAt:new Date()}:{})}});
    await tx.auditLog.create({data:{action:`CURRENCY_${action}`,category:"FINANCE",entityType:"CurrencyRequest",entityId:id,description:`Account ${userId} confirmed ${action}`}});
    await notifyAction(tx,{userId,key:`currency:${id}:${result.status}`,type:"CURRENCY_REQUEST",title:action==="CANCEL"?"Request cancelled and refunded":"External settlement confirmed",body:action==="CANCEL"?`${row.diamonds} Diamonds returned to your balance.`:"Your external settlement confirmation was recorded.",action:{screen:"WALLET",requestId:id}});
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
      await tx.walletTransaction.create({data:ledgerData({userId:row.userId,type:"REFUND",direction:"CREDIT",title:"Rejected Diamond request refunded",diamonds:row.diamonds,referenceId:row.id,metadata:row.kind==="REDEMPTION"&&row.policySnapshot?.rules?.redemptionHostSourceRequired?{restoredHostDiamonds:String(row.diamonds)}:{}})});
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
    await notifyAction(tx,{userId:row.userId,key:`currency:${id}:${status}`,type:"CURRENCY_REQUEST",title:status==="REJECTED"?"Request rejected and refunded":status==="APPROVED"?"Withdrawal approved":row.kind==="REDEMPTION"?"Redemption completed":"Payment completed",body:status==="REJECTED"?`${row.diamonds} Diamonds refunded. ${note}`:status==="APPROVED"?"Your request is approved. Payment is still pending.":row.kind==="REDEMPTION"?`${row.quotedCoins} Coins credited to your wallet.`:"Your manual payment has been verified and its transaction reference recorded.",action:{screen:"WALLET",requestId:id}});
    return serializeCurrencyRequest(updated);
  });
}
