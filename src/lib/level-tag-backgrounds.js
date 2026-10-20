import { decorationMedia, namedDecoration } from './decoration-media.js';

export function levelMediaOrigin(origin) {
  for (const value of [origin, process.env.MOBILE_API_BASE_URL, process.env.AUTH_URL]) {
    if (!value || value === 'null') continue;
    try {
      const url = new URL(value);
      if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.origin;
    } catch { /* Try the configured canonical origin instead. */ }
  }
  return null;
}

export async function levelTagBackgrounds(db, origin, selections = null) {
  if (!origin || origin === 'null') return new Map();
  origin = levelMediaOrigin(origin);
  // Background jobs may have no request or configured public origin. Never
  // fabricate a host or let optional artwork roll back progression work.
  if (!origin) return new Map();
  const needed=selections?.filter(s=>['USER','CHARM','GAME','AGENCY'].includes(s.track)&&Number.isSafeInteger(s.level)&&s.level>=0);
  if(needed && !needed.length)return new Map();
  const rows = await db.levelTagBackground.findMany({where:{asset:{active:true},...(needed?{OR:needed.map(({track,level})=>({track,level}))}:{})},include:{asset:{select:{publicId:true,mimeType:true,mediaVersion:true,posterMimeType:true,posterMediaVersion:true,cdnUrl:true,posterCdnUrl:true,category:true,isGlobal:true,storeVisible:true,active:true,audioRoomId:true}}}});
  const backgrounds=new Map();
  for(const row of rows){
    try{backgrounds.set(`${row.track}:${row.level}`,decorationMedia(row.asset,origin));}
    catch{console.warn('Level background URL omitted',row.track,row.level);}
  }
  return backgrounds;
}
export function tagBackground(map,track,level) {
  const background=map.get(`${track}:${level}`)??null;
  return {background,...namedDecoration('background',background)};
}
