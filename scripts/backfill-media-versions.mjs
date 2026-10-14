// Dry-run by default. --apply changes only version metadata, never media bytes.
import {config} from "dotenv";
config({path:process.env.AUDIT_ENV_FILE||".env.local",quiet:true});
const {prisma}=await import("../src/lib/prisma.js");
const {mediaVersion}=await import("../src/lib/media-version.js");
let cursor,scanned=0,changed=0,conflicts=0;
try{
 for(;;){
  const rows=await prisma.uploadAsset.findMany({orderBy:{id:"asc"},take:10,...(cursor?{cursor:{id:cursor},skip:1}:{}),select:{id:true,updatedAt:true,fileData:true,posterFileData:true,mediaVersion:true,posterMediaVersion:true}});
  if(!rows.length)break;
  for(const row of rows){
   scanned++;
   const data={mediaVersion:mediaVersion(row.fileData),posterMediaVersion:mediaVersion(row.posterFileData)};
   if(data.mediaVersion===row.mediaVersion&&data.posterMediaVersion===row.posterMediaVersion)continue;
   changed++;
   if(process.argv.includes("--apply")){
    const result=await prisma.uploadAsset.updateMany({where:{id:row.id,updatedAt:row.updatedAt},data:{...data,updatedAt:row.updatedAt}});
    if(!result.count)conflicts++;
   }
  }
  cursor=rows.at(-1).id;
 }
 console.log(JSON.stringify({mode:process.argv.includes("--apply")?"APPLY":"DRY_RUN",scanned,changed,conflicts}));
}finally{await prisma.$disconnect();}
