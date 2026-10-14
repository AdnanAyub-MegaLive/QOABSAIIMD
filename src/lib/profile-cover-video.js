import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
const exec=promisify(execFile);
export async function validateCoverVideo(bytes, {noAudio=false} = {}) {
 const dir=await mkdtemp(join(tmpdir(),"mega-cover-"));
 try {
  const path=join(dir,"cover.mp4");await writeFile(path,bytes);
  const {stdout}=await exec(process.env.FFPROBE_PATH||"ffprobe",["-v","error","-protocol_whitelist","file","-show_streams","-show_format","-of","json",path],{timeout:15000,maxBuffer:256*1024,windowsHide:true});
  const info=JSON.parse(stdout),streams=info.streams??[],videos=streams.filter(s=>s.codec_type==="video"),duration=Number(info.format?.duration);
  if(noAudio&&streams.some(s=>s.codec_type==="audio"))throw new Error("Remove the audio track before uploading.");
  if(!info.format?.format_name?.split(",").includes("mp4")||!Number.isFinite(duration)||duration<=0||duration>30||videos.length!==1||videos[0].codec_name!=="h264"||videos[0].width>3840||videos[0].height>3840||streams.some(s=>s.codec_type!=="video"&&(s.codec_type!=="audio"||s.codec_name!=="aac")))throw new Error("Invalid video");
 }catch(e){
  if(e.code==="ENOENT")throw Object.assign(new Error("Video validation is unavailable on this server."),{code:"VIDEO_VALIDATION_UNAVAILABLE",status:503});
  throw Object.assign(new Error("Use a valid H.264 MP4, optional AAC audio, up to 30 seconds and 3840 pixels."),{code:"VALIDATION_ERROR"});
 }finally{await rm(dir,{recursive:true,force:true});}
}
