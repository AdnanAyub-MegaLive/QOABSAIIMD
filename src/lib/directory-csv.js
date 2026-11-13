import { parsePortalDate } from './business-time.js';
import { Prisma, UserRole, ApplicationRole, AccountStatus } from '@prisma/client';
import { reportCycle, publicCycle } from './reporting-cycles.js';
export const exportModules = { users:'WEALTH_RANKING', hosts:'HOST_SALARY', agencies:'AGENCY_COMMISSION' };
export function csvCell(value) {
  let text=String(value??'').replace(/\u0000/g,'');
  // Spreadsheet formula injection includes leading whitespace and control chars.
  if (/^[\s]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text)) text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
export function exportFilters(params) {
  const kind=params.get('kind')||'users',country=(params.get('country')||'').trim(),role=(params.get('role')||'').trim(),status=params.get('status')||'';
  if(!exportModules[kind]||country.length>80||(role&&!Object.values(UserRole).includes(role)&&!Object.values(ApplicationRole).includes(role))||(status && !(kind==='agencies'?['ACTIVE','SUSPENDED','BANNED','INACTIVE','PENDING','REJECTED']:Object.values(AccountStatus)).includes(status)))throw Object.assign(new Error('Invalid export filters.'),{status:422});
  const from=params.get('from'),to=params.get('to');
  if(Boolean(from)!==Boolean(to)||[from,to].filter(Boolean).some(x=>!/^\d{4}-\d{2}-\d{2}$/.test(x)||!Number.isFinite(Date.parse(x))||new Date(x).toISOString().slice(0,10)!==x))throw Object.assign(new Error('Provide valid from and to dates together.'),{status:422});
  if(from&&(from>to||Date.parse(to)-Date.parse(from)>366*86400000))throw Object.assign(new Error('Choose a date range of at most 366 days.'),{status:422});
  return {kind,country,role,status,from,to,cycle:params.get('cycle')};
}
export async function directoryCsv(db, filters, signal, now=new Date()) {
  const {kind,country,role,status,from,to}=filters;
  const period=from?{start:parsePortalDate(from),end:new Date(+parsePortalDate(to)+86400000),key:'CUSTOM',days:null,revision:null,label:'Custom date range'}:await reportCycle(db,exportModules[kind],filters.cycle,now);
  const agency=kind==='agencies',model=agency?db.agency:db.user;
  const where={createdAt:{lte:now},...(agency?{}:{deletedAt:null}),...(country?{country}:{}),...(status?{status}:{}),...(!agency&&kind==='hosts'?{OR:[{role:'HOST'},{appRoles:{has:'HOST'}}]}:{}),...(!agency&&role?{AND:[{OR:[...(Object.values(UserRole).includes(role)?[{role}]:[]),...(Object.values(ApplicationRole).includes(role)?[{appRoles:{has:role}}]:[])]}]}:{})};
  let cursor=null,cancelled=false,legacy=false;
  const select=agency?{id:true,publicId:true,name:true,country:true,status:true,createdAt:true}:{id:true,publicId:true,name:true,country:true,status:true,createdAt:true,role:true,appRoles:true,agency:{select:{publicId:true,name:true}}};
  const read=async()=>legacy ? db.$queryRaw(Prisma.sql`
    SELECT t.id,t."publicId",t."displayName" AS name,t.country,t.status,t."createdAt",'HOST' AS role,
      ARRAY['HOST'] AS "appRoles",json_build_object('publicId',a."publicId",'name',a.name) AS agency
    FROM "Talent" t JOIN "Agency" a ON a.id=t."agencyId"
    WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u."publicId"=t."publicId")
      AND t."createdAt"<=${now} ${cursor?Prisma.sql`AND t.id>${cursor}`:Prisma.empty}
      ${country?Prisma.sql`AND t.country=${country}`:Prisma.empty}
      ${status?Prisma.sql`AND t.status::text=${status}`:Prisma.empty}
      ${role&&role!=='HOST'?Prisma.sql`AND FALSE`:Prisma.empty}
    ORDER BY t.id LIMIT 500`) : model.findMany({where,select,orderBy:{id:'asc'},take:500,...(cursor?{cursor:{id:cursor},skip:1}:{})});
  let batch=await read();
  const header=['record_source','public_id','name','country','status','roles','agency_id','created_at','cycle','start_utc_inclusive','end_utc_exclusive','gift_face_value_coins_sent','received_gift_diamonds','unvalued_gifts'];
  const encoder=new TextEncoder();let first=true;
  const stream=new ReadableStream({async pull(controller){try{
    if(cancelled||signal?.aborted){controller.close();return;}
    const rows=batch??await read();batch=null;
    const ids=rows.map(r=>r.id),time={gte:period.start,lt:period.end};
    const [sent,received]=ids.length?await Promise.all([
      agency||legacy?[]:db.giftTransaction.groupBy({by:['senderId'],where:{senderId:{in:ids},reversedAt:null,createdAt:time},_sum:{coinValue:true}}),
      db.$queryRaw(Prisma.sql`SELECT ${agency?Prisma.sql`s."agencyId"`:legacy?Prisma.sql`g."talentId"`:Prisma.sql`COALESCE(g."recipientUserId",u.id)`} AS id,
        SUM(s."recipientDiamonds") AS total, COUNT(*)-COUNT(s."recipientDiamonds") AS missing
        FROM "GiftSettlement" s JOIN "GiftTransaction" g ON g.id=s."giftTransactionId"
        LEFT JOIN "Talent" t ON t.id=g."talentId" LEFT JOIN "User" u ON u."publicId"=t."publicId"
        WHERE g."reversedAt" IS NULL AND s."createdAt">=${period.start} AND s."createdAt"<${period.end}
        AND ${agency?Prisma.sql`s."agencyId"`:legacy?Prisma.sql`g."talentId"`:Prisma.sql`COALESCE(g."recipientUserId",u.id)`} IN (${Prisma.join(ids)}) GROUP BY 1`),
    ]):[[],[]];
    const totals=new Map(received.map(r=>[r.id,{sum:BigInt(r.total??0),missing:Number(r.missing)}]));
    const sentTotals=new Map(sent.map(r=>[r.senderId,r._sum.coinValue??0n]));
    let text=first?'\uFEFF'+header.map(csvCell).join(',')+'\r\n':'';first=false;
    text+=rows.map(r=>{const t=totals.get(r.id)??{sum:0n,missing:0};return [legacy?'LEGACY_TALENT':agency?'AGENCY':'USER',r.publicId,r.name,r.country,r.status,agency?'AGENCY':[...new Set([r.role,...r.appRoles])].join('|'),r.agency?.publicId??'',r.createdAt.toISOString(),period.key,period.start.toISOString(),period.end.toISOString(),agency||legacy?'':String(sentTotals.get(r.id)??0n),t.missing?'':String(t.sum),t.missing].map(csvCell).join(',');}).join('\r\n')+(rows.length?'\r\n':'');
    controller.enqueue(encoder.encode(text));cursor=rows.at(-1)?.id;
    if(rows.length<500){if(kind==='hosts'&&!legacy){legacy=true;cursor=null;}else controller.close();}
  }catch(e){if(!cancelled)controller.error(e);}},cancel(){cancelled=true;}});
  return {stream,cycle:publicCycle(period)};
}
