import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/portal-admin';
import { sameOrigin } from '@/lib/game-control/http';
import { readUploadForm } from '@/lib/upload-form';
import { requestOrigin } from '@/lib/user-perks';
import { levelTagBackgrounds } from '@/lib/level-tag-backgrounds';
import { mirrorAssetBestEffort } from '@/lib/media-cdn';
import { isRateLimited } from '@/lib/rate-limit';
const fail=(message,status=422)=>Object.assign(new Error(message),{status});
const error=e=>Response.json({success:false,error:{message:e.status?e.message:'Unable to update level background.'}},{status:e.status??500});
async function levels(){
  const [config,activity]=await Promise.all([prisma.progressionConfiguration.findFirst({where:{active:true},include:{levels:true}}),prisma.activityLevelRule.findMany()]);
  return [...(config?.levels??[]).map(l=>({track:l.track,level:l.level})),...activity.flatMap(r=>r.levels.map(l=>({track:r.track,level:l.level})))];
}
export async function GET(request){try{
  await requirePermission('rules.view');
  const artwork=await levelTagBackgrounds(prisma,requestOrigin(request));
  return Response.json({success:true,data:(await levels()).map(l=>({...l,background:artwork.get(`${l.track}:${l.level}`)??null}))},{headers:{'Cache-Control':'no-store'}});
}catch(e){return error(e);}}
export async function POST(request){try{
  const admin=await requirePermission('rules.levels');sameOrigin(request);
  if(isRateLimited(`level-background:${admin.id}`,{limit:30,windowMs:60000}))throw fail('Please wait before uploading more backgrounds.',429);
  const form=await readUploadForm(request,9*1024*1024),track=String(form.get('track')),level=Number(form.get('level'));
  if(!(await levels()).some(l=>l.track===track&&l.level===level))throw fail('Save this level before adding its background.');
  const file=form.get('file');
  if(!(file instanceof File)||!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw fail('Upload a PNG, JPEG, WebP or GIF image.');
  if(!file.size||file.size>8*1024*1024)throw fail('Backgrounds must be at most 8 MB.',413);
  let bytes;
  try{
    const input=Buffer.from(await file.arrayBuffer());
    const image=sharp(input,{animated:true,limitInputPixels:16000000});const meta=await image.metadata();
    if(({png:'image/png',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif'})[meta.format]!==file.type||(meta.pages??1)>100)throw Error();
    bytes=await image.resize({width:1024,height:512,fit:'inside',withoutEnlargement:true}).webp().toBuffer();
    if(bytes.length>8*1024*1024)throw Error();
  }catch{throw fail('Invalid image, too many frames or excessive decoded dimensions.');}
  const asset=await prisma.$transaction(async tx=>{
    const asset=await tx.uploadAsset.create({data:{publicId:`AST-${randomUUID()}`,name:`${track} level ${level} tag background`,category:'BADGES',fileName:'level-background.webp',mimeType:'image/webp',fileSize:bytes.length,fileData:bytes,mediaVersion:createHash('sha256').update(bytes).digest('hex').slice(0,16),isGlobal:true,storeVisible:false,distribution:'MANUAL',active:true}});
    await tx.levelTagBackground.upsert({where:{track_level:{track,level}},create:{track,level,assetId:asset.id},update:{assetId:asset.id}});
    await tx.auditLog.create({data:{adminId:admin.id,action:'LEVEL_BACKGROUND_UPDATED',category:'USER_MANAGEMENT',entityType:'LevelTagBackground',entityId:`${track}:${level}`,description:'Updated level tag artwork only; XP thresholds unchanged.'}});
    return asset;
  });
  await mirrorAssetBestEffort(prisma,asset);
  return Response.json({success:true});
}catch(e){return error(e);}}
export async function DELETE(request){try{
  const admin=await requirePermission('rules.levels');sameOrigin(request);const {track,level}=await request.json();
  if(!['USER','CHARM','GAME','AGENCY'].includes(track)||!Number.isSafeInteger(level)||level<0)throw fail('Invalid level.');
  await prisma.$transaction(async tx=>{await tx.levelTagBackground.deleteMany({where:{track,level}});await tx.auditLog.create({data:{adminId:admin.id,action:'LEVEL_BACKGROUND_REMOVED',category:'USER_MANAGEMENT',entityType:'LevelTagBackground',entityId:`${track}:${level}`,description:'Removed tag background link; shared media preserved.'}});});return Response.json({success:true});
}catch(e){return error(e);}}
