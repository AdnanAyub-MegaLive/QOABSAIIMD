// Read-only production verification; no accounts, balances or event records are changed.
import dotenv from 'dotenv';
import {readFile} from 'node:fs/promises';
dotenv.config({path:'.env.local',quiet:true});
if(process.env.INSPECT_PID){
  const raw=await readFile(`/proc/${process.env.INSPECT_PID}/environ`,'utf8');
  const runtime=Object.fromEntries(raw.split('\0').filter(Boolean).map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}));
  console.log(JSON.stringify({runtimeDatabaseDefined:Boolean(runtime.DATABASE_URL),sameDatabase:runtime.DATABASE_URL?runtime.DATABASE_URL===process.env.DATABASE_URL:null}));
  if(runtime.DATABASE_URL)process.env.DATABASE_URL=runtime.DATABASE_URL;
}
const {prisma}=await import('../src/lib/prisma.js');
const {eventRankings}=await import('../src/lib/events/ranking-data.js');
const {resolvePublishedFile}=await import('../src/lib/events/storage.js');
try {
  const events=await prisma.event.findMany({select:{slug:true,status:true,version:true,versions:{select:{version:true,folderName:true,entryFile:true}}}});
  console.log(JSON.stringify({events}));
  for(const event of events.filter(e=>/rank/i.test(e.slug))){const v=event.versions.find(v=>v.version===event.version);try{const f=await resolvePublishedFile(v.folderName,v.entryFile);console.log(JSON.stringify({slug:event.slug,fileBytes:f.buffer.length}));}catch(e){console.log(JSON.stringify({slug:event.slug,fileError:e.code||e.message}));}}
  for(const type of ['wealth','charm','agency','cp']){
    const r=await eventRankings({type,period:'month',offset:0,q:'',viewerId:'read-only-ranking-inspection',origin:'https://portal.megachat.live'});
    console.log(JSON.stringify({type,entryCount:r.entries.length,topScores:r.entries.slice(0,3).map(e=>({rank:e.rank,score:e.score})),nextOffset:r.nextOffset}));
  }
}finally{await prisma.$disconnect();}
