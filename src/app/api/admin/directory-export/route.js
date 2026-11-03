import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/portal-admin';
import { directoryCsv, exportFilters } from '@/lib/directory-csv';
export async function GET(request){try{
  const filters=exportFilters(new URL(request.url).searchParams);
  await requirePermission(`${filters.kind}.export`);
  const {stream,cycle}=await directoryCsv(prisma,filters,request.signal);
  return new Response(stream,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${filters.kind}-${cycle.key}.csv"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(e){return Response.json({success:false,error:{message:e.status?e.message:'Unable to export records.'}},{status:e.status??500});}}
