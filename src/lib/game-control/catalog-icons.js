import sharp from 'sharp';
import { createPublicDisplayAssetUrl } from '../upload-assets.js';
import { publicCdnUrl } from '../media-cdn-policy.js';

export const gameIconWhere = { category: 'GAME_ICONS', active: true, isGlobal: true, audioRoomId: null, mimeType: 'image/webp' };
export async function decodeGameIcon(file) {
  const formats = {'image/png':'png','image/jpeg':'jpeg','image/webp':'webp'};
  if (!formats[file.type] || file.size > 5*1024*1024) throw Object.assign(new Error('Choose a PNG, JPEG or WebP image up to 5 MB.'),{status:422});
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()),{limitInputPixels:16000000,failOn:'warning',animated:true});
    const meta = await image.metadata();
    if (meta.format !== formats[file.type] || (meta.pages??1)>1) throw new Error('Unsupported image');
    return await image.rotate().resize(256,256,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).webp({quality:88}).toBuffer();
  } catch { throw Object.assign(new Error('The icon is corrupt, animated, or does not match its file type.'),{status:422}); }
}
export function catalogIcon(asset,origin) {
  const iconUrl=publicCdnUrl(asset)||createPublicDisplayAssetUrl(origin,asset);
  return {iconAssetId:asset.publicId,iconUrl,imageUrl:iconUrl,iconMimeType:asset.mimeType,iconVersion:asset.mediaVersion};
}
export async function attachGameIcons(db,games,origin) {
  const ids=[...new Set(games.map(g=>g.iconAssetId).filter(Boolean))];
  if(!ids.length)return games;
  const assets=await db.uploadAsset.findMany({where:{...gameIconWhere,publicId:{in:ids}},select:{publicId:true,category:true,active:true,isGlobal:true,mimeType:true,mediaVersion:true,cdnUrl:true}});
  const map=new Map(assets.map(a=>[a.publicId,a]));
  return games.map(g=>map.has(g.iconAssetId)?{...g,...catalogIcon(map.get(g.iconAssetId),origin)}:g);
}
