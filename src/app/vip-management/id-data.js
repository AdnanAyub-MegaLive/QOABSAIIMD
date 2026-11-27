import { occupiedSpecialId } from "@/lib/special-id-ownership";
import { prisma } from "@/lib/prisma";
import { reconcileExpiredSpecialIds } from "@/lib/special-id";
import { SERVER_PAGE_SIZE, splitPage } from "@/lib/portal-paging";

/** One page of special ID assignments (newest first, optional search) plus the active catalog. */
export async function loadVipIdData({ skip = 0, take = SERVER_PAGE_SIZE, q = "" } = {}) {
  await reconcileExpiredSpecialIds();
  const ci = { contains: q, mode: "insensitive" };
  const where = q
    ? { user: { deletedAt: null }, OR: [{ specialId: ci }, { user: { publicId: ci } }, { user: { name: ci } }] }
    : { user: { deletedAt: null } };
  const [rows, total, definitions] = await Promise.all([
    prisma.specialIdAssignment.findMany({where,include:{definition:true,user:{select:{publicId:true,name:true}}},orderBy:[{createdAt:"desc"},{id:"desc"}],skip,take:take+1}),
    prisma.specialIdAssignment.count({where}),
    prisma.specialIdDefinition.findMany({where:{active:true},include:{assignments:{where:occupiedSpecialId(new Date()),include:{user:{select:{publicId:true}}}}}}),
  ]);
  const { items, hasNext } = splitPage(rows, take);
  return {
    assignments:items.map(item=>({id:item.id,userId:item.user.publicId,user:item.user.name,specialId:item.specialId,category:item.definition?.category??"LEGACY",source:item.source,status:item.status,durationMinutes:item.expiresAt?Math.max(1,Math.round((item.expiresAt-item.startsAt)/60000)):null,starts:item.startsAt.toLocaleString("en-US", { timeZone: 'Asia/Bangkok' }),expires:item.expiresAt?.toLocaleString("en-US", { timeZone: 'Asia/Bangkok' })??"Legacy"})),
    catalog:definitions.map(item=>({id:item.id,code:item.code,coinPrice:item.coinPrice?.toString()??null,storeVisible:item.storeVisible,category:item.category,minimumVipLevel:item.minimumVipLevel,minimumTopUpAmount:Number(item.minimumTopUpAmount??0),defaultDurationMinutes:item.defaultDurationMinutes,active:item.active,assignedTo:item.assignments[0]?.user.publicId??null,expiresAt:item.assignments[0]?.expiresAt?.toISOString()??null})),
    paging:{ total, hasNext },
  };
}
