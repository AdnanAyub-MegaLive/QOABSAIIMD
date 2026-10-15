// Run after deploying the Host-source-aware redemption implementation.
import dotenv from "dotenv";
dotenv.config({path:".env.local",quiet:true});
const {prisma}=await import("../src/lib/prisma.js");
const {validateCurrencyPolicy}=await import("../src/lib/currency-policy.js");
try {
  if(!process.argv.includes("--apply")) throw new Error("Pass --apply to set the approved 9 Diamonds : 5 Coins reseller rate. No balances are modified.");
  const version=await prisma.$transaction(async tx=>{
    const previous=await tx.currencyPolicy.findUniqueOrThrow({where:{id:"GLOBAL"}});
    const rules=validateCurrencyPolicy({...previous.rules,redemptionEnabled:true,redemptionDiamondsPerCoin:"9",redemptionCoinsNumerator:"5",redemptionDeductionBps:"0"});
    const row=await tx.currencyPolicy.update({where:{id:"GLOBAL",version:previous.version},data:{rules,version:{increment:1}}});
    await tx.auditLog.create({data:{action:"CURRENCY_POLICY_UPDATED",category:"FINANCE",entityType:"CurrencyPolicy",entityId:"GLOBAL",description:"Approved reseller redemption: 9 verified Host-transfer Diamonds to 5 Coins, no deduction, admin-reviewed.",metadata:{previousVersion:previous.version,version:row.version,previousRules:previous.rules,rules}}});
    return row.version;
  },{isolationLevel:"Serializable"});
  console.log(JSON.stringify({version,balancesChanged:false}));
} finally {await prisma.$disconnect();}
