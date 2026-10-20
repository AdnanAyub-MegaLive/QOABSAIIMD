import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { managementProgressReport, reportSelection, progressCsv } from "@/lib/management-progress-report";
export const dynamic = "force-dynamic";
export async function GET(request) {
  try {
    await requirePermission("rules.hierarchy");
    const params = new URL(request.url).searchParams;
    let selection;
    try { selection = reportSelection(params); }
    catch(error) { return Response.json({success:false,error:{message:error.message}},{status:422}); }
    const data = await prisma.$transaction(tx=>managementProgressReport(tx,selection),{isolationLevel:"RepeatableRead",timeout:30000});
    if(params.get("format")==="csv") return new Response(progressCsv(data),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="management-progress-${selection.from}-${selection.to}.csv"`,"Cache-Control":"private, no-store"}});
    return Response.json({success:true,data},{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) {
    if(!error.status) console.error("Management progress report failed",error);
    return Response.json({success:false,error:{message:error.status?error.message:"Unable to load management progress."}},{status:error.status??500});
  }
}
