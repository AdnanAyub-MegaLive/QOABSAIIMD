import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/portal-admin';
import { sameOrigin, jsonBody } from '@/lib/game-control/http';
import { cycleModules, cycleFromPolicies, publicCycle, saveCycle } from '@/lib/reporting-cycles';
const failure = e => Response.json({ success:false, error:{ message: e.status ? e.message : ['P2034','P2002'].includes(e.code) ? 'Settings changed. Reload before saving.' : 'Unable to load cycle settings.' } }, { status:e.status ?? (['P2034','P2002'].includes(e.code)?409:500) });
export async function GET() { try {
  const admin = await requirePermission('rules.view'), now = new Date();
  const policies = await prisma.reportingCyclePolicy.findMany({orderBy:{revision:'desc'}});
  const items = Object.entries(cycleModules).map(([module,label]) => {
    const rows = policies.filter(p=>p.module===module);
    return {module,label,current:publicCycle(cycleFromPolicies(rows,now)),revision:rows[0]?.revision??0,pending:rows.find(p=>p.effectiveFrom>now)??null};
  });
  return Response.json({success:true,data:{items,canManage:admin.role==='SUPER_ADMIN'}},{headers:{'Cache-Control':'private, no-store'}});
} catch(e){return failure(e);} }
export async function POST(request) { try {
  sameOrigin(request); const admin=await requirePermission('rules.view');
  return Response.json({success:true,data:await saveCycle(prisma,admin,await jsonBody(request))});
} catch(e){return failure(e);} }
