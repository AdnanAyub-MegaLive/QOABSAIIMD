import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
const exec=promisify(execFile);
export async function validateVoice(bytes,durationMs){
 if(!bytes.length||bytes.length>1024*1024||!Number.isInteger(durationMs)||durationMs<1||durationMs>60000)throw Object.assign(new Error("Voice must be at most 60 seconds and 1 MB."),{code:"VALIDATION_ERROR"});
 const dir=await mkdtemp(join(tmpdir(),"mega-voice-"));
 try{
  const path=join(dir,"voice.m4a");await writeFile(path,bytes);
  const {stdout}=await exec(process.env.FFPROBE_PATH||"ffprobe",["-v","error","-protocol_whitelist","file","-show_streams","-show_format","-of","json",path],{timeout:10000,maxBuffer:65536,windowsHide:true});
  const info=JSON.parse(stdout),streams=info.streams??[],seconds=Number(info.format?.duration);
  if(!info.format?.format_name?.split(",").includes("m4a")||streams.length!==1||streams[0].codec_type!=="audio"||streams[0].codec_name!=="aac"||streams[0].channels!==1||!Number.isFinite(seconds)||seconds<=0||seconds>60||Math.abs(seconds*1000-durationMs)>1500)throw Error("Invalid audio");
  return Math.ceil(seconds*1000);
 }catch(error){throw Object.assign(new Error(error.code==="ENOENT"?"Audio validation is unavailable.":"Use a valid mono AAC M4A recording, at most 60 seconds."),{code:error.code==="ENOENT"?"VOICE_STORAGE_UNAVAILABLE":"VALIDATION_ERROR"});}
 finally{await rm(dir,{recursive:true,force:true});}
}
