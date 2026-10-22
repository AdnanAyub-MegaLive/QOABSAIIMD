import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { portalPermissionError } from '@/lib/portal-admin';
import { moderationFilters } from '@/lib/room-moderation-query';
export async function GET(request){
 const denied=await portalPermissionError('rooms.view');if(denied)return denied;
 let f;try{f=moderationFilters(new URL(request.url).searchParams);}catch(e){return Response.json({success:false,error:{code:'VALIDATION_ERROR',message:e.message}},{status:422});}
 const now=new Date();
 const rows=await prisma.$queryRaw(Prisma.sql`
 WITH entries AS (
 SELECT COALESCE((SELECT m.id FROM "AudioRoomModerationLog" m WHERE m."audioRoomId"=b."audioRoomId" AND m."targetId"=b."userId" AND m."actorId"=b."actorId" AND m.action='ROOM_BANNED' AND m."expiresAt" IS NOT DISTINCT FROM b."expiresAt" ORDER BY abs(extract(epoch from m."createdAt"-b."createdAt")),m.id LIMIT 1), b.id) AS id,
 'ROOM_BANNED' AS action,b."audioRoomId",b."userId" AS "targetId",b."actorId",NULL::text AS "adminActorId",NULL::text AS "adminActorName",b.reason,b."createdAt",b."expiresAt",
 CASE WHEN b."expiresAt" IS NULL THEN 0 ELSE round(extract(epoch from b."expiresAt"-b."createdAt")/60)::int END AS "durationMinutes",
 CASE WHEN b."revokedAt" IS NOT NULL THEN 'REVOKED' WHEN b."expiresAt"<=${now} THEN 'EXPIRED' ELSE 'ACTIVE' END AS status,b."publicId" AS "banId"
 FROM "AudioRoomBan" b
 UNION ALL
 SELECT m.id,m.action,m."audioRoomId",m."targetId",m."actorId",m."adminActorId",m."adminActorName",m.reason,m."createdAt",m."expiresAt",m."durationMinutes",'COMPLETED',NULL::text
 FROM "AudioRoomModerationLog" m WHERE m.action IN ('KICK','SEAT_KICK','ROOM_UNBANNED')
 )
 SELECT e.*,json_build_object('roomId',r."roomId",'title',r.title) AS room,
 json_build_object('publicId',t."publicId",'name',t.name) AS target,
 json_build_object('publicId',a."publicId",'name',COALESCE(e."adminActorName",a.name),'adminId',e."adminActorId") AS actor
 FROM entries e JOIN "AudioRoom" r ON r.id=e."audioRoomId"
 LEFT JOIN "User" t ON t.id=e."targetId" LEFT JOIN "User" a ON a.id=e."actorId"
 WHERE (${f.type}='ALL' OR e.action=CASE ${f.type} WHEN 'BAN' THEN 'ROOM_BANNED' ELSE ${f.type} END)
 AND (${f.status}='ALL' OR e.status=${f.status})
 AND (${f.from}::timestamp IS NULL OR e."createdAt">=${f.from}::timestamp)
 AND (${f.to}::timestamp IS NULL OR e."createdAt"<${f.to}::timestamp)
 AND (${f.q}='' OR strpos(lower(concat_ws(' ',t.name,t."publicId",r."roomId",r.title)),lower(${f.q}))>0)
 ORDER BY e."createdAt" DESC,e.id DESC LIMIT 51 OFFSET ${(f.page-1)*50}
 `);
 return Response.json({success:true,data:{page:f.page,hasMore:rows.length>50,items:rows.slice(0,50)}},{headers:{'Cache-Control':'no-store'}});
}
