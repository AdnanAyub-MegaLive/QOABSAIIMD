import {it,expect} from "vitest";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {validateVoice} from "./voice-validation.js";
it("validates real mono AAC recordings and rejects corrupt audio/oversize/duration mismatch",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"voice-test-"));
 try{
  const path=join(dir,"test.m4a");await promisify(execFile)(process.env.FFMPEG_PATH||"ffmpeg",["-v","error","-f","lavfi","-i","anullsrc=r=16000:cl=mono","-t","1","-c:a","aac",path],{windowsHide:true,timeout:10000});
  expect(await validateVoice(await readFile(path),1000)).toBeGreaterThan(0);
  // Keep the container/duration intact but damage its encoded audio packets.
  const damaged=Buffer.from(await readFile(path)),mdat=damaged.indexOf(Buffer.from("mdat"));
  expect(mdat).toBeGreaterThan(0);
  const end=mdat-4+damaged.readUInt32BE(mdat-4);
  damaged.fill(255,mdat+4,Math.min(mdat+204,end));
  await expect(validateVoice(damaged,1000)).rejects.toMatchObject({code:"VALIDATION_ERROR"});
  await expect(validateVoice(await readFile(path),10000)).rejects.toThrow();
  await expect(validateVoice(Buffer.from("not audio"),1000)).rejects.toThrow();
  await expect(validateVoice(Buffer.alloc(1024*1024+1),1000)).rejects.toThrow();
 }finally{await rm(dir,{recursive:true,force:true});}
},20000);
