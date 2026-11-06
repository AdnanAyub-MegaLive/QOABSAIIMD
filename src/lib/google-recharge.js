import { createHash } from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import { ledgerData } from "./wallet.js";

const hash = value => createHash("sha256").update(value).digest("hex");
export const billingAccountId = userId => hash("megalive:google-play:" + userId);
const fail = (code, message, status) => Object.assign(new Error(message), {code,status});
const maxCoins = 9223372036854775807n;

async function verifyWithGoogle(productId, token) {
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
  if (!packageName) throw fail("PLAY_NOT_CONFIGURED","Google Play package name is missing.",503);
  try {
    const auth = new GoogleAuth({ scopes:["https://www.googleapis.com/auth/androidpublisher"] });
    const url = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/" +
      [packageName,"purchases","products",productId,"tokens",token].map(encodeURIComponent).join("/");
    const result = await auth.request({url, timeout:10000});
    return result.data;
  } catch (error) {
    const status = error.response?.status;
    if ([400,404,410].includes(status)) throw fail("PURCHASE_INVALID","Google Play could not verify this purchase.",422);
    throw fail("PLAY_PROVIDER_UNAVAILABLE","Google Play verification failed (HTTP " + (status ?? "unavailable") + ").",503);
  }
}
function receiptResult(row, userId, productId) {
  if (row.userId !== userId || row.productId !== productId) throw fail("PURCHASE_MISMATCH","This purchase does not match your account or product.",409);
  return { productId, creditedCoins: row.coins.toString(), quantity:row.quantity, consume:true };
}
export async function creditGoogleRecharge(db, userId, body, verify = verifyWithGoogle) {
  const {productId,purchaseToken} = body ?? {};
  if (typeof productId !== "string" || !/^[a-z0-9][a-z0-9._]{0,127}$/.test(productId) ||
      typeof purchaseToken !== "string" || !purchaseToken.trim() || purchaseToken.length > 4096)
    throw fail("VALIDATION_ERROR","Provide a Google Play product ID and purchase token.",422);
  const tokenHash = hash(purchaseToken);
  const previous = await db.googleRechargeReceipt.findUnique({where:{tokenHash}});
  if (previous) return receiptResult(previous,userId,productId);
  // Disabled products are hidden from the catalog. Previously sold purchases may still arrive.
  const product = await db.googleRechargeProduct.findUnique({where:{productId}});
  if (!product) throw fail("PRODUCT_UNAVAILABLE","Unknown recharge product.",404);
  const purchase = await verify(productId,purchaseToken);
  if (purchase.purchaseState === 2) throw fail("PURCHASE_PENDING","Your Google Play purchase is pending.",409);
  if (purchase.purchaseState !== 0 || purchase.consumptionState !== 0 ||
      purchase.obfuscatedExternalAccountId !== billingAccountId(userId) ||
      (purchase.productId && purchase.productId !== productId))
    throw fail("PURCHASE_INVALID","This purchase is unavailable for this account.",422);
  const quantity = purchase.quantity ?? 1;
  const coins = product.coins * BigInt(Number.isSafeInteger(quantity) ? quantity : 0);
  if (coins <= 0n || coins > maxCoins) throw fail("PURCHASE_INVALID","Invalid purchase quantity.",422);
  const receipt = {tokenHash,userId,productId,quantity,coins};
  return db.$transaction(async tx => {
    const created = await tx.googleRechargeReceipt.createMany({data:[receipt],skipDuplicates:true});
    if (!created.count) return receiptResult(await tx.googleRechargeReceipt.findUniqueOrThrow({where:{tokenHash}}),userId,productId);
    const credited = await tx.user.updateMany({where:{id:userId,status:"ACTIVE",deletedAt:null,coinBalance:{lte:maxCoins-coins},totalTopUp:{lte:maxCoins-coins}},
      data:{coinBalance:{increment:coins},totalTopUp:{increment:coins}}});
    if (!credited.count) throw fail("RECHARGE_UNAVAILABLE","This account cannot receive this recharge.",409);
    await tx.walletTransaction.create({data:ledgerData({userId,type:"COIN_TOP_UP",direction:"CREDIT",title:"Google Play recharge",
      referenceId:"PLAY:"+tokenHash,coins,metadata:{productId,quantity}})});
    return receiptResult(receipt,userId,productId);
  });
}
