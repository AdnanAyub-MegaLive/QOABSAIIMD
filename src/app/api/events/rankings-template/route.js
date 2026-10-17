import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { requireEventUser } from '@/lib/events/auth';
import { eventJson, eventErrorResponse, EventModuleError } from '@/lib/events/errors';
import { createEventWithUpload } from '@/lib/events/service';
import { requestIp } from '@/lib/events/request';
import { prisma } from '@/lib/prisma';
import { eventRankingTypes } from '@/lib/events/ranking-contract';
export async function POST(request) {
  try {
    const user=await requireEventUser(request,{csrf:true,roles:['SUPER_ADMIN','JUNIOR_ADMIN']});
    const track=new URL(request.url).searchParams.get('track');
    if(track&&!eventRankingTypes.includes(track))throw new EventModuleError('VALIDATION_ERROR','Unknown ranking.',422);
    const slug=track?`ranking-${track}`:'rankings';
    if(await prisma.event.findUnique({where:{slug}}))throw new EventModuleError('SLUG_EXISTS','This ranking event already exists. Manage it in the event list.',409);
    const root=path.join(process.cwd(),'event-templates','rankings');
    const formData=new FormData();
    for(const filename of ['index.html','style.css','app.js',...(await readdir(path.join(root,'assets'))).map(name=>`assets/${name}`)]){
      let content=await readFile(path.join(root,filename));
      if(track&&['index.html','app.js','style.css'].includes(filename)) {
        content=content.toString().replaceAll('/event/rankings/',`/event/${slug}/`);
        if(filename==='index.html')content=content.replace('data-theme="wealth"',`data-theme="${track}" data-track="${track}" data-event="${slug}"`);
      }
      formData.append('files',new File([content],path.basename(filename)));
      formData.append('paths',filename);
    }
    const event=await createEventWithUpload({metadata:{name:track?`Mega Live ${track.toUpperCase()} Rankings`:'Mega Live Rankings',slug},formData,user,ip:requestIp(request)});
    return eventJson({success:true,data:{event}},201);
  }catch(error){return eventErrorResponse(error,'RANKING_TEMPLATE_FAILED');}
}
