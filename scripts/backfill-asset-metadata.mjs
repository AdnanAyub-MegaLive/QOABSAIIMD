import {config} from "dotenv";
config({path:process.env.AUDIT_ENV_FILE||".env.local",quiet:true});
const {prisma}=await import("../src/lib/prisma.js");
const {mediaVersion}=await import("../src/lib/media-version.js");
const apply=process.argv.includes("--apply");
const batchArg=process.argv.find(arg=>arg.startsWith("--batch="));
const batchSize=Math.min(Math.max(Number(batchArg?.slice(8))||50,1),500);
const cdnBase=(()=>{try{return new URL(process.env.MEDIA_CDN_BASE_URL||"https://media.megachat.live").origin;}catch{return null;}})();
const report={mode:apply?"APPLY":"DRY_RUN",batchSize,scanned:0,versionsFilled:0,sizesFilled:0,posterSizesFilled:0,conflicts:0,missingFile:[],missingPosterFile:[],missingMimeType:[],missingPosterMimeType:[],externalLinks:[]};
function external(value){
 if(!value)return false;
 if(value.startsWith("/api/uploads/"))return false;
 try{const url=new URL(value);return !(url.origin===cdnBase&&url.pathname.startsWith("/portal-media/"))&&!/^\/api\/uploads\//.test(url.pathname);}catch{return true;}
}
let cursor;
try{
 for(;;){
  const rows=await prisma.uploadAsset.findMany({orderBy:{id:"asc"},take:batchSize,...(cursor?{cursor:{id:cursor},skip:1}:{}),select:{id:true,publicId:true,category:true,updatedAt:true,mimeType:true,fileSize:true,posterMimeType:true,posterFileSize:true,mediaVersion:true,posterMediaVersion:true,cdnUrl:true,posterCdnUrl:true}});
  if(!rows.length)break;
  cursor=rows.at(-1).id;
  report.scanned+=rows.length;
  for(const row of rows){
   if(!row.mimeType)report.missingMimeType.push({assetId:row.publicId,category:row.category});
   if(!row.posterMimeType&&(row.posterFileSize||row.posterMediaVersion))report.missingPosterMimeType.push({assetId:row.publicId,category:row.category});
   for(const field of ["cdnUrl","posterCdnUrl"])if(external(row[field]))report.externalLinks.push({assetId:row.publicId,category:row.category,field,url:row[field]});
  }
  const pending=rows.filter(row=>!row.mediaVersion||row.fileSize<=0||((!row.posterMediaVersion||!row.posterFileSize)&&row.posterMimeType));
  for(const row of pending){
   const bytes=await prisma.uploadAsset.findUnique({where:{id:row.id},select:{fileData:true,posterFileData:true}});
   const data={};
   if(!bytes?.fileData?.length)report.missingFile.push({assetId:row.publicId,category:row.category});
   else{
    if(!row.mediaVersion)data.mediaVersion=mediaVersion(bytes.fileData);
    if(row.fileSize<=0)data.fileSize=bytes.fileData.length;
   }
   if(row.posterMimeType){
    if(!bytes?.posterFileData?.length)report.missingPosterFile.push({assetId:row.publicId,category:row.category});
    else{
     if(!row.posterMediaVersion)data.posterMediaVersion=mediaVersion(bytes.posterFileData);
     if(!row.posterFileSize)data.posterFileSize=bytes.posterFileData.length;
    }
   }
   if(!Object.keys(data).length)continue;
   if(data.mediaVersion||data.posterMediaVersion)report.versionsFilled++;
   if(data.fileSize)report.sizesFilled++;
   if(data.posterFileSize)report.posterSizesFilled++;
   if(apply){
    const result=await prisma.uploadAsset.updateMany({where:{id:row.id,updatedAt:row.updatedAt},data:{...data,updatedAt:row.updatedAt}});
    if(!result.count)report.conflicts++;
   }
  }
 }
 console.log(JSON.stringify(report,null,2));
}finally{await prisma.$disconnect();}
