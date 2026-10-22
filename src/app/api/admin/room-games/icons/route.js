import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/portal-admin';
import { sameOrigin } from '@/lib/game-control/http';
import { readAvatarFile } from '@/lib/avatar-upload';
import { decodeGameIcon, catalogIcon, gameIconWhere } from '@/lib/game-control/catalog-icons';
import { mirrorAssetBestEffort } from '@/lib/media-cdn';
import { isRateLimited } from '@/lib/rate-limit';
export const runtime='nodejs';
const origin=r=>process.env.MOBILE_API_BASE_URL||new URL(r.url).origin;
function failure(e){return Response.json({success:false,error:{message:e.status||e.code==='VALIDATION_ERROR'||e.code==='FILE_TOO_LARGE'?e.message:'Unable to process game icon.'}},{status:e.status||(e.code==='FILE_TOO_LARGE'?413:e.code==='VALIDATION_ERROR'?422:500)});}
export async function GET(request){
 try{
  await requirePermission('roomGames.view');
  const assets=await prisma.uploadAsset.findMany({where:{...gameIconWhere,archivedAt:null},select:{publicId:true,name:true,category:true,active:true,isGlobal:true,mimeType:true,mediaVersion:true,cdnUrl:true},orderBy:[{createdAt:'desc'},{publicId:'desc'}],take:100});
  return Response.json({success:true,data:{items:assets.map(a=>({name:a.name,...catalogIcon(a,origin(request))}))}},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failure(e);}
}
export async function POST(request){
 try{
  const admin=await requirePermission('roomGames.manage');sameOrigin(request);
  if(isRateLimited(`game-icons:${admin.id}`,{limit:10,windowMs:60000}))return Response.json({success:false,error:{message:'Too many uploads. Try again shortly.'}},{status:429});
  const file=await readAvatarFile(request,5*1024*1024);
  const bytes=await decodeGameIcon(file),publicId=`AST-${randomUUID()}`;
  const asset=await prisma.$transaction(async tx=>{
   const created=await tx.uploadAsset.create({data:{publicId,name:file.name.slice(0,120),category:'GAME_ICONS',fileName:`${publicId}.webp`,mimeType:'image/webp',fileData:bytes,fileSize:bytes.length,isGlobal:true,storeVisible:false,active:true}});
   await tx.auditLog.create({data:{adminId:admin.id,action:'ROOM_GAME_ICON_UPLOADED',category:'CONTENT_MANAGEMENT',entityType:'UploadAsset',entityId:publicId,description:'Uploaded public room-game icon.'}});
   return created;
  });
  const published=await mirrorAssetBestEffort(prisma,asset);
  return Response.json({success:true,data:{name:asset.name,...catalogIcon(published,origin(request))}},{status:201,headers:{'Cache-Control':'no-store'}});
 }catch(e){return failure(e);}
}
