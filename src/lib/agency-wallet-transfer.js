import { prisma } from './prisma.js';
import { currencyPolicy } from './currency-policy.js';
import { diamondRules, validateServiceAmount, checkDiamondLimits, serviceError } from './diamond-service-rules.js';
import { ledgerData, parsePositiveCoins } from './wallet.js';
import { notifyAction } from './action-notifications.js';

export async function agencyTransferSettings(db, user, policy) {
  const rules = diamondRules(policy, user, 'TRANSFER');
  const exchange = diamondRules(policy, user, 'EXCHANGE');
  const agency = user.agencyId ? await db.agency.findUnique({where:{id:user.agencyId},include:{owner:true}}) : null;
  const owner = agency?.owner;
  const host = user.role === 'HOST' || user.appRoles?.includes('HOST');
  const eligible = host && agency?.status === 'ACTIVE' && owner && owner.id !== user.id && owner.status === 'ACTIVE' && !owner.deletedAt && !owner.walletFrozen && !user.walletFrozen;
  return {...rules, enabled: Boolean(eligible && rules.enabled && exchange.enabled), reason: !eligible ? 'An active host and agency owner with available wallets are required.' : rules.reason || exchange.reason,
    diamondsPerCoin: exchange.diamondsPerCoin, recipient: eligible ? {publicId:owner.publicId,name:owner.name} : null};
}

export async function transferToAgencyOwner(userId, body, key, db = prisma) {
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key ?? '')) throw serviceError('VALIDATION_ERROR','Provide a valid idempotency key.');
  const requested = parsePositiveCoins(body?.diamonds, 'diamonds');
  const referenceId = `AGT:${key}`;
  const fingerprint = JSON.stringify([String(requested),body.recipientPublicId,body.policyVersion,body.expectedCoins]);
  for (let attempt=0;attempt<4;attempt++) try {
    return await db.$transaction(async tx => {
      const previous = await tx.walletTransaction.findUnique({where:{userId_type_referenceId:{userId,type:'TRANSFER_SENT',referenceId}}});
      if(previous) {
        if(previous.metadata.fingerprint !== fingerprint) throw serviceError('IDEMPOTENCY_CONFLICT','Request key already used.',409);
        return previous.metadata.result;
      }
      const user = await tx.user.findUniqueOrThrow({where:{id:userId}});
      const policy = await currencyPolicy(tx);
      const settings = await agencyTransferSettings(tx,user,policy);
      validateServiceAmount(requested,settings,'TRANSFER');
      if(body.policyVersion !== policy.version || body.recipientPublicId !== settings.recipient.publicId) throw serviceError('QUOTE_CHANGED','Agency owner or exchange settings changed. Refresh and confirm again.',409);
      const rate=BigInt(settings.diamondsPerCoin), coins=requested/rate, used=coins*rate;
      if(body.expectedCoins != null && body.expectedCoins !== String(coins)) throw serviceError('QUOTE_CHANGED','Exchange amount changed. Refresh and confirm again.',409);
      if(!coins) throw serviceError('TRANSFER_BELOW_MINIMUM','Amount does not convert to a whole Coin.');
      await checkDiamondLimits(tx,userId,used,settings,'TRANSFER');
      const recipient=await tx.user.findUniqueOrThrow({where:{publicId:settings.recipient.publicId}});
      const debit=await tx.user.updateMany({where:{id:userId,status:'ACTIVE',deletedAt:null,walletFrozen:false,hostSalaryCoinBalance:{gte:requested}},data:{hostSalaryCoinBalance:{decrement:used}}});
      if(!debit.count) throw serviceError('INSUFFICIENT_DIAMONDS','Insufficient available Diamonds.',409);
      const credit=await tx.user.updateMany({where:{id:recipient.id,status:'ACTIVE',deletedAt:null,walletFrozen:false,coinBalance:{lte:9223372036854775807n-coins}},data:{coinBalance:{increment:coins}}});
      if(!credit.count) throw serviceError('RECIPIENT_UNAVAILABLE','Agency owner cannot receive Coins.',409);
      const result={referenceId,exchangedDiamonds:String(used),receivedCoins:String(coins),remainingDiamonds:String(user.hostSalaryCoinBalance-used),recipientPublicId:recipient.publicId};
      const metadata={fingerprint,policyVersion:policy.version,diamondsPerCoin:String(rate),recipientPublicId:recipient.publicId,senderPublicId:user.publicId,result};
      await tx.walletTransaction.createMany({data:[
        ledgerData({userId,type:'TRANSFER_SENT',direction:'DEBIT',title:'Diamonds transferred to agency owner',diamonds:used,referenceId,metadata}),
        ledgerData({userId:recipient.id,type:'TRANSFER_RECEIVED',direction:'CREDIT',title:'Coins from host Diamonds',coins,referenceId,metadata})
      ]});
      await notifyAction(tx,{userId:recipient.id,key:referenceId,type:'TRANSFER_RECEIVED',title:'Host transfer received',body:`${coins} Coins received from ${user.name}.`,action:{screen:'WALLET',referenceId}});
      return result;
    },{isolationLevel:'Serializable'});
  } catch(error) {if(attempt===3 || !['P2034','P2002'].includes(error.code))throw error;}
}
