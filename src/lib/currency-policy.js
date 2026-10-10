import { payoutConfiguration } from "./withdrawal-contract.js";
export const currencyDefaults = {
  giftDiamondsNumerator: "1", giftCoinsDenominator: "1", giftBasis: "GROSS",
  rechargeCoinsPerUsd: "45000", withdrawalDiamondsPerUsd: "90000",
  userExchangeEnabled: true, userDiamondsPerCoin: "2", hostExchangeEnabled: false, hostDiamondsPerCoin: "",
  exchangeMinDiamonds: "10000", hostTransferEnabled: true,
  redemptionEnabled: false, redemptionDiamondsPerCoin: "", redemptionDeductionBps: "",
  usdtEnabled: false, usdtMicrosPerUsd: "", withdrawalMinDiamonds: "", withdrawalMaxDiamonds: "",
  feeBearer: "HOST", commissionChart: [],
};
const MAX=9223372036854775807n;
export function currencyError(message, code="VALIDATION_ERROR") { return Object.assign(new Error(message),{code}); }
export function amount(value, allowZero=false) {
  if(!/^\d+$/.test(String(value??"")))throw currencyError("Enter a whole-number amount.");
  const n=BigInt(value);if(n>MAX||n<(allowZero?0n:1n))throw currencyError("Amount is outside the supported range.");return n;
}
export function validateCurrencyPolicy(input) {
  const r=Object.fromEntries(Object.keys(currencyDefaults).map(key=>[key,input[key]??currencyDefaults[key]]));
  for (const key of ["withdrawalDiamondsPerUsd","usdtMicrosPerUsd","withdrawalMinDiamonds","withdrawalMaxDiamonds"]) r[key]=input[key]??"";
  r.feeBearer=input.feeBearer??"";
  for(const key of ["userExchangeEnabled","hostExchangeEnabled","hostTransferEnabled","redemptionEnabled","usdtEnabled"])if(typeof r[key]!=="boolean")throw currencyError("Invalid availability setting.");
  for(const key of ["giftDiamondsNumerator","giftCoinsDenominator","rechargeCoinsPerUsd","userDiamondsPerCoin","exchangeMinDiamonds"])r[key]=amount(r[key]).toString();
  for(const key of ["withdrawalDiamondsPerUsd","hostDiamondsPerCoin","redemptionDiamondsPerCoin","usdtMicrosPerUsd","withdrawalMinDiamonds","withdrawalMaxDiamonds"])r[key]=r[key]===""?"":amount(r[key]).toString();
  if(!["GROSS","AFTER_SPLIT"].includes(r.giftBasis)||!["","HOST","COMPANY"].includes(r.feeBearer))throw currencyError("Invalid calculation policy.");
  if(r.redemptionDeductionBps!==""){r.redemptionDeductionBps=amount(r.redemptionDeductionBps,true).toString();if(BigInt(r.redemptionDeductionBps)>10000n)throw currencyError("Deduction cannot exceed 100%.");}
  if(r.hostExchangeEnabled&&!r.hostDiamondsPerCoin)throw currencyError("Configure the host exchange rate first.");
  if(r.redemptionEnabled&&(!r.redemptionDiamondsPerCoin||r.redemptionDeductionBps===""))throw currencyError("Configure reseller rate and deductions first.");
  if(!Array.isArray(r.commissionChart)||r.commissionChart.length>30)throw currencyError("Invalid commission chart.");
  let last=-1n;
  r.commissionChart=r.commissionChart.map(row=>{
    const min=amount(row.minUsdMicros,true),bps=amount(row.bps,true),fixed=amount(row.fixedUsdtMicros,true),network=amount(row.networkUsdtMicros,true);
    if(min<=last||bps>10000n)throw currencyError("Chart thresholds must strictly increase; commission must be 0–10000 basis points.");last=min;
    return {minUsdMicros:String(min),bps:String(bps),fixedUsdtMicros:String(fixed),networkUsdtMicros:String(network)};
  });
  if(r.usdtEnabled&&(!r.feeBearer||!r.withdrawalDiamondsPerUsd||!r.usdtMicrosPerUsd||!r.withdrawalMinDiamonds||!r.withdrawalMaxDiamonds||!r.commissionChart.length||r.commissionChart[0].minUsdMicros!=="0"))throw currencyError("Configure payout rate, limits and a chart starting at zero before enabling USDT.");
  if(r.withdrawalMinDiamonds&&r.withdrawalMaxDiamonds&&BigInt(r.withdrawalMinDiamonds)>BigInt(r.withdrawalMaxDiamonds))throw currencyError("Minimum exceeds maximum.");
  return r;
}
export async function currencyPolicy(db) {
  const record = await db.currencyPolicy.findUnique({where:{id:"GLOBAL"}});
  return record ? {...record, configured:true} : {version:1, configured:false, rules:{...currencyDefaults, withdrawalDiamondsPerUsd:null, usdtMicrosPerUsd:null, withdrawalMinDiamonds:null, withdrawalMaxDiamonds:null, feeBearer:null}};
}
export function giftDiamonds(gross, allocated, policy) {
  const r=policy.rules;
  const result=(r.giftBasis==="GROSS"?gross:allocated)*BigInt(r.giftDiamondsNumerator)/BigInt(r.giftCoinsDenominator);
  if(result>MAX)throw currencyError("Gift award exceeds supported amount.");return result;
}
export function payoutQuote(diamonds, policy) {
  const r=policy.rules;
  if(!payoutConfiguration(policy))throw currencyError("Payout configuration is incomplete.","PAYOUT_CONFIGURATION_INCOMPLETE");
  if(!r.usdtEnabled)throw currencyError("Official withdrawals are not configured.","WITHDRAWAL_DISABLED");
  if(diamonds<BigInt(r.withdrawalMinDiamonds)||diamonds>BigInt(r.withdrawalMaxDiamonds))throw currencyError("Withdrawal amount is outside the limits.");
  const grossUsdMicros=diamonds*1000000n/BigInt(r.withdrawalDiamondsPerUsd);
  const grossUsdtMicros=diamonds*BigInt(r.usdtMicrosPerUsd)/BigInt(r.withdrawalDiamondsPerUsd);
  const tier=[...r.commissionChart].reverse().find(row=>grossUsdMicros>=BigInt(row.minUsdMicros));
  if(!tier)throw currencyError("No matching commission bracket.");
  const commission=grossUsdtMicros*BigInt(tier.bps)/10000n+BigInt(tier.fixedUsdtMicros);
  const network=r.feeBearer==="HOST"?BigInt(tier.networkUsdtMicros):0n;
  const net=grossUsdtMicros-commission-network;
  if(net<=0n||net>MAX)throw currencyError("Net payout must be positive and within limits.");
  return {grossUsdMicros:String(grossUsdMicros),grossUsdtMicros:String(grossUsdtMicros),commissionMicros:String(commission),networkFeeMicros:String(network),netUsdtMicros:String(net)};
}
export function rechargePrice(coins,policy){
  const rate=BigInt(policy.rules.rechargeCoinsPerUsd);
  const cents=(coins*100n+rate-1n)/rate;
  return `${cents/100n}.${String(cents%100n).padStart(2,"0")}`;
}
