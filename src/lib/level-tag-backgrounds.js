import { decorationMedia, namedDecoration } from './decoration-media.js';

export async function levelTagBackgrounds(db, origin) {
  const rows = await db.levelTagBackground.findMany({where:{asset:{active:true}},include:{asset:{select:{publicId:true,mimeType:true,mediaVersion:true,posterMimeType:true,posterMediaVersion:true,cdnUrl:true,posterCdnUrl:true,category:true,isGlobal:true,storeVisible:true,active:true,audioRoomId:true}}}});
  return new Map(rows.map(row=>[`${row.track}:${row.level}`,decorationMedia(row.asset,origin)]));
}
export function tagBackground(map,track,level) {
  const background=map.get(`${track}:${level}`)??null;
  return {background,...namedDecoration('background',background)};
}
