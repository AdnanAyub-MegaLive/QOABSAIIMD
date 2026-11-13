import dotenv from 'dotenv';
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
dotenv.config({path:'.env.local',quiet:true});
const { prisma }=await import('../src/lib/prisma.js');
const { uploadNewVersion }=await import('../src/lib/events/service.js');
const { eventStoragePaths }=await import('../src/lib/events/storage.js');
const { patchRewardModal }=await import('../src/lib/events/ranking-reward-patch.js');
async function filesAt(root,prefix=''){
  const files=[];
  for(const entry of await readdir(path.join(root,prefix),{withFileTypes:true})){
    const name=prefix+entry.name;
    if(entry.isSymbolicLink())throw new Error('Unexpected symlink in event version');
    if(entry.isDirectory())files.push(...await filesAt(root,name+'/'));
    else files.push(name);
  }
  return files;
}
try{
  const user=await prisma.eventUser.findFirst({where:{active:true,role:'SUPER_ADMIN'},orderBy:{id:'asc'}});
  if(!user)throw new Error('An active Events Super Admin is required.');
  for(const slug of ['rankings','ranking-wealth','ranking-charm','ranking-agency','ranking-cp','ranking-game','ranking-weekly-star']){
    const event=await prisma.event.findUnique({where:{slug},include:{versions:true}});
    if(event?.status!=='PUBLISHED')continue;
    const version=event.versions.find(v=>v.version===event.version);
    if(!version)throw new Error(`${slug}: current version missing`);
    const storage=path.resolve(eventStoragePaths().permanentRoot);
    const root=path.resolve(storage,version.folderName);
    if(!root.startsWith(storage+path.sep))throw new Error('Invalid event path');
    const original=await readFile(path.join(root,'app.js'),'utf8');
    const template=await readFile(path.join('event-templates',slug,'app.js'),'utf8');
    const patched=patchRewardModal(original,template);
    if(patched===original){console.log(`${slug}: already updated`);continue;}
    const formData=new FormData();
    for(const name of await filesAt(root)){
      formData.append('files',new File([name==='app.js'?patched:await readFile(path.join(root,name))],path.basename(name)));
      formData.append('paths',name);
    }
    const updated=await uploadNewVersion({id:event.id,formData,user,ip:'127.0.0.1'});
    console.log(`${slug}: published version ${updated.version}`);
  }
}finally{await prisma.$disconnect();}
