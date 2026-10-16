import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { spacesConfig } from "./media-cdn.js";
function storage(){
 const c=spacesConfig();if(!c)throw Object.assign(new Error("Voice storage is unavailable."),{code:"VOICE_STORAGE_UNAVAILABLE"});
 return {bucket:c.bucket,client:new S3Client({endpoint:c.endpoint,region:"us-east-1",credentials:c.credentials,maxAttempts:2,requestChecksumCalculation:"WHEN_REQUIRED"})};
}
export async function voiceObject(action,key,bytes){
 if(!/^private-voice\/[a-f0-9-]+\.m4a$/.test(key))throw Error("Invalid voice key");
 const {bucket,client}=storage(),args={Bucket:bucket,Key:key};
 const command=action==="put"?new PutObjectCommand({...args,Body:bytes,ACL:"private",ContentType:"audio/mp4",CacheControl:"private, no-store"}):action==="delete"?new DeleteObjectCommand(args):new GetObjectCommand(args);
 return client.send(command,{abortSignal:AbortSignal.timeout(15000)});
}
export async function pruneVoiceObjects(db,now=new Date()){
 const rows=await db.voiceObject.findMany({where:{expiresAt:{lte:now}},orderBy:{expiresAt:"asc"},take:100});
 for(const row of rows){try{await voiceObject("delete",row.key);await db.voiceObject.delete({where:{key:row.key}});}catch{console.error("Private voice cleanup will retry",row.key);}}
}
