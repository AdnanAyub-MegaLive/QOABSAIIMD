// Compare first; --apply publishes versioned bundles without altering event settings.
import dotenv from 'dotenv';
import path from 'node:path';
import {readdir,readFile} from 'node:fs/promises';
dotenv.config({path:'.env.local',quiet:true});
const {prisma}=await import('../src/lib/prisma.js');
const {uploadNewVersion}=await import('../src/lib/events/service.js');
const {eventStoragePaths,filesFromFormData}=await import('../src/lib/events/storage.js');
async function filesAt(root,prefix=''){
 const files=[];
 for(const item of await readdir(path.join(root,prefix),{withFileTypes:true})){
  if(item.isSymbolicLink())throw new Error('Unexpected asset symlink');
  const name=prefix+item.name;
  if(item.isDirectory())files.push(...await filesAt(root,name+'/'));
  else files.push(name);
 }
 return files;
}
try{
 const storage=path.resolve(eventStoragePaths().permanentRoot),plans=[];
 for(const slug of ['rankings','ranking-wealth','ranking-charm','ranking-agency','ranking-cp','ranking-game','ranking-weekly-star']){
  const event=await prisma.event.findUnique({where:{slug},include:{versions:true}});
  if(event?.status!=='PUBLISHED'){console.log(JSON.stringify({slug,status:'skipped: unpublished'}));continue;}
  const version=event.versions.find(v=>v.version===event.version);
  if(!version)throw new Error(`${slug}: missing current version`);
  const current=path.resolve(storage,version.folderName);
  if(!current.startsWith(storage+path.sep))throw new Error('Invalid version path');
  const template=path.resolve('event-templates',slug);
  const files=new Map(await Promise.all((await filesAt(current)).map(async name=>[name,await readFile(path.join(current,name))])));
  const changed=[];
  for(const name of await filesAt(template)){
   if(name==='tailwind.css'||name==='utilities.txt'||/\.(md|map)$/i.test(name))continue;
   const data=await readFile(path.join(template,name));
   if(!files.get(name)?.equals(data)){changed.push(name);files.set(name,data);}
  }
  console.log(JSON.stringify({slug,version:event.version,changed}));
  if(changed.length)plans.push({event,files});
 }
 for(const plan of plans){
  const form=new FormData();
  for(const [name,data] of plan.files){form.append('files',new File([data],path.basename(name)));form.append('paths',name);}
  const validated=await filesFromFormData(form);
  console.log(JSON.stringify({slug:plan.event.slug,validatedFiles:validated.files.length}));
 }
 if(process.argv.includes('--apply')){
  const user=await prisma.eventUser.findFirst({where:{active:true,role:'SUPER_ADMIN'},orderBy:{id:'asc'}});
  if(!user)throw new Error('An active Events Super Admin is required.');
  for(const {event,files} of plans){
   const latest=await prisma.event.findUnique({where:{id:event.id}});
   if(latest.version!==event.version||latest.status!=='PUBLISHED')throw new Error(`${event.slug} changed since preflight`);
   const formData=new FormData();
   for(const [name,data] of files){formData.append('files',new File([data],path.basename(name)));formData.append('paths',name);}
   const updated=await uploadNewVersion({id:event.id,formData,user,ip:'127.0.0.1'});
   console.log(JSON.stringify({slug:event.slug,previousVersion:event.version,publishedVersion:updated.version}));
  }
 }
}finally{await prisma.$disconnect();}
