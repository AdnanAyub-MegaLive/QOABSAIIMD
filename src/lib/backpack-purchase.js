import { ledgerData } from './wallet.js';
const type = 'BACKPACK_GIFT_PURCHASE';
function fail(code,message,status=422){throw Object.assign(new Error(message),{code,status});}
export async function purchaseBackpack(db,user,{giftId,quantity=1,requestKey}) {
  if(typeof requestKey!=='string'||!/^[-A-Za-z0-9._:]{8,128}$/.test(requestKey))fail('IDEMPOTENCY_KEY_REQUIRED','Update the app to purchase backpack gifts safely. A valid Idempotency-Key is required.');
  if(typeof giftId!=='string'||!giftId||!Number.isInteger(quantity)||quantity<1||quantity>999)fail('VALIDATION_ERROR','Choose a gift and a quantity from 1 to 999.');
  const referenceId=`backpack:${requestKey}`;
  const where={userId_type_referenceId:{userId:user.id,type,referenceId}};
  function receipt(record){
    if(record.metadata?.giftId!==giftId||record.metadata?.quantity!==quantity)fail('IDEMPOTENCY_CONFLICT','This request key belongs to a different purchase.',409);
    if(!record.metadata?.receipt)fail('PURCHASE_RECEIPT_UNAVAILABLE','Purchase recorded; contact support before retrying.',409);
    return record.metadata.receipt;
  }
  try{return await db.$transaction(async tx=>{
    // Lock the buyer before reading the receipt. Concurrent retries wait and then
    // read the committed receipt, even when the first purchase exhausted funds.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    const old=await tx.walletTransaction.findUnique({where});
    if(old)return receipt(old);
    const gift=await tx.uploadAsset.findFirst({where:{publicId:giftId,category:'GIFTS',active:true,coinPrice:{gt:0n}}});
    if(!gift)fail('GIFT_NOT_FOUND','This gift is unavailable.',404);
    const coins=gift.coinPrice*BigInt(quantity);
    const debit=await tx.user.updateMany({where:{id:user.id,coinBalance:{gte:coins}},data:{coinBalance:{decrement:coins},totalSpent:{increment:coins}}});
    if(!debit.count)fail('INSUFFICIENT_COINS','Your coin balance is too low.',409);
    const inventory=await tx.userGiftInventory.upsert({where:{userId_giftAssetId:{userId:user.id,giftAssetId:gift.id}},create:{userId:user.id,giftAssetId:gift.id,quantity},update:{quantity:{increment:quantity}}});
    const result={giftId,quantity:inventory.quantity,purchasedQuantity:quantity,spentCoins:coins.toString(),requestKey};
    await tx.walletTransaction.create({data:ledgerData({userId:user.id,type,direction:'DEBIT',title:`Added ${gift.name} to backpack`,coins,referenceId,metadata:{giftId,quantity,receipt:result}})});
    return result;
  },{isolationLevel:'ReadCommitted'});}catch(error){
    if(error.code==='P2002'){const old=await db.walletTransaction.findUnique({where});if(old)return receipt(old);}
    throw error;
  }
}
