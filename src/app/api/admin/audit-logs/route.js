import {prisma} from '@/lib/prisma';
import {requirePermission} from '@/lib/portal-admin';
import {auditFilters,auditRow} from '@/lib/audit-view';
import {auditExport} from '@/lib/audit-export';
export async function GET(request){
 try{
  await requirePermission('audit.view');
  const params=Object.fromEntries(new URL(request.url).searchParams),{where}=auditFilters(params);
  if(params.export==='all')return new Response(await auditExport(prisma,where,request.signal),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Disposition':'attachment; filename="audit-logs.json"','X-Content-Type-Options':'nosniff'}});
  const rows=await prisma.auditLog.findMany({where,include:{admin:{select:{name:true,email:true}}},orderBy:[{createdAt:'desc'},{id:'desc'}],take:501});
  return Response.json({success:true,data:{items:rows.slice(0,500).map(auditRow),truncated:rows.length>500,limit:500}}, {headers:{'Cache-Control':'no-store','Content-Disposition':'attachment; filename="audit-logs.json"'}});
 }catch(error){return Response.json({success:false,error:{code:error.status?error.code:'AUDIT_READ_FAILED',message:error.status?error.message:'Unable to read audit records.'}},{status:error.status??500,headers:{'Cache-Control':'no-store'}});}
}
