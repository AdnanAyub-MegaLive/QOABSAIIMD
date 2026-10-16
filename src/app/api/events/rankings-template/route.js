import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { requireEventUser } from '@/lib/events/auth';
import { eventJson, eventErrorResponse, EventModuleError } from '@/lib/events/errors';
import { createEventWithUpload } from '@/lib/events/service';
import { requestIp } from '@/lib/events/request';
import { prisma } from '@/lib/prisma';
export async function POST(request) {
  try {
    const user=await requireEventUser(request,{csrf:true,roles:['SUPER_ADMIN','JUNIOR_ADMIN']});
    if(await prisma.event.findUnique({where:{slug:'rankings'}}))throw new EventModuleError('SLUG_EXISTS','The rankings event already exists. Manage it in the event list.',409);
    const root=path.join(process.cwd(),'event-templates','rankings');
    const formData=new FormData();
    for(const filename of ['index.html','style.css','app.js',...(await readdir(path.join(root,'assets'))).map(name=>`assets/${name}`)]){
      formData.append('files',new File([await readFile(path.join(root,filename))],path.basename(filename)));
      formData.append('paths',filename);
    }
    const event=await createEventWithUpload({metadata:{name:'Mega Live Rankings',slug:'rankings'},formData,user,ip:requestIp(request)});
    return eventJson({success:true,data:{event}},201);
  }catch(error){return eventErrorResponse(error,'RANKING_TEMPLATE_FAILED');}
}
