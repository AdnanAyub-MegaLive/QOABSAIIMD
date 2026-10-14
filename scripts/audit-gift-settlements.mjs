// Read-only: never invent historical Diamonds from the current policy.
import {config} from "dotenv";
config({path:process.env.AUDIT_ENV_FILE||".env.local",quiet:true});
const {prisma:db}=await import("../src/lib/prisma.js");
try {
 const report={mode:"DRY_RUN",generatedAt:new Date().toISOString(),counts:{},issues:[]};
 let cursor;
 do {
  const rows=await db.giftTransaction.findMany({orderBy:{id:"asc"},take:500,...(cursor?{cursor:{id:cursor},skip:1}:{}),select:{id:true,talentId:true,recipientUserId:true,reversedAt:true}});
  if(!rows.length)break;
  const settlements=await db.giftSettlement.findMany({where:{giftTransactionId:{in:rows.map(r=>r.id)}}});
  const byId=new Map(settlements.map(s=>[s.giftTransactionId,s]));
  for(const row of rows){
   const s=byId.get(row.id),codes=[];
   if(!s)codes.push("MISSING_SETTLEMENT");
   else {if(s.recipientDiamonds==null)codes.push("UNKNOWN_HISTORICAL_DIAMONDS");if(s.recipientType==="HOST"&&!s.agencyId)codes.push("HOST_AGENCY_MISSING");}
   if(row.talentId&&!row.recipientUserId)codes.push("RECIPIENT_ACCOUNT_UNLINKED");
   if(row.reversedAt)codes.push("REVIEW_XP_REVERSAL");
   for(const code of codes)report.counts[code]=(report.counts[code]||0)+1;
   if(codes.length)report.issues.push({transactionId:row.id,codes});
  }
  cursor=rows.at(-1).id;
 }while(cursor);
 console.log(JSON.stringify(report,null,2));
}finally{await db.$disconnect();}
