import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { requireEventUser } from '@/lib/events/auth';
import { eventJson, eventErrorResponse, EventModuleError } from '@/lib/events/errors';
import { createEventWithUpload, uploadNewVersion } from '@/lib/events/service';
import { requestIp } from '@/lib/events/request';
import { prisma } from '@/lib/prisma';
import { eventRankingTypes } from '@/lib/events/ranking-contract';
export async function POST(request) {
  try {
    const user=await requireEventUser(request,{csrf:true,roles:['SUPER_ADMIN','JUNIOR_ADMIN']});
    const track=new URL(request.url).searchParams.get('track');
    if(track&&!eventRankingTypes.includes(track))throw new EventModuleError('VALIDATION_ERROR','Unknown ranking.',422);
    const slug=track?`ranking-${track}`:'rankings';
    const existing=await prisma.event.findUnique({where:{slug}});
    if(existing&&new URL(request.url).searchParams.get('newVersion')!=='true')throw new EventModuleError('SLUG_EXISTS','This ranking event already exists. Use newVersion=true to generate a new immutable version.',409);
    const root=path.join(process.cwd(),'event-templates',slug);
    const formData=new FormData();
    for(const filename of ['index.html','style.css','app.js',...(await readdir(path.join(root,'assets'))).map(name=>`assets/${name}`)]){
      const content=await readFile(path.join(root,filename));
      formData.append('files',new File([content],path.basename(filename)));
      formData.append('paths',filename);
    }
    const event=existing?await uploadNewVersion({id:existing.id,formData,user,ip:requestIp(request)}):await createEventWithUpload({metadata:{name:track?`Mega Live ${track.toUpperCase()} Rankings`:'Mega Live Rankings',slug},formData,user,ip:requestIp(request)});
    return eventJson({success:true,data:{event}},201);
  }catch(error){return eventErrorResponse(error,'RANKING_TEMPLATE_FAILED');}
}
