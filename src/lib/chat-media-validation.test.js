import { expect, it } from "vitest";
import sharp from "sharp";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { decodeChatPicture, decodeChatVideo } from "./chat-media-validation.js";
it("re-encodes pictures and rejects mismatched declared types and malformed content",async()=>{
  const png=await sharp({create:{width:40,height:30,channels:3,background:"red"}}).png().toBuffer();
  const picture=await decodeChatPicture(png,"image/png");
  expect(picture).toMatchObject({mimeType:"image/webp",width:40,height:30});
  await expect(decodeChatPicture(png,"image/gif")).rejects.toMatchObject({code:"VALIDATION_ERROR"});
  await expect(decodeChatPicture(Buffer.from("GIF89a broken"),"image/gif")).rejects.toMatchObject({code:"VALIDATION_ERROR"});
});
it("retains GIF and WebP animation frames",async()=>{
  const raw=Buffer.from([255,0,0,0,255,0]);
  for(const format of ["gif","webp"]){
    const input=await sharp(raw,{raw:{width:1,height:2,channels:3,pageHeight:1}})[format]({loop:0,delay:[100,100]}).toBuffer();
    const result=await decodeChatPicture(input,`image/${format}`);
    expect((await sharp(result.bytes,{animated:true}).metadata()).pages).toBe(2);
    expect(result.height).toBe(1);
  }
});
it("rejects oversized uploads before decoding",async()=>{
  await expect(decodeChatPicture(Buffer.alloc(10*1024*1024+1),"image/jpeg")).rejects.toMatchObject({code:"FILE_TOO_LARGE"});
  await expect(decodeChatVideo(Buffer.alloc(50*1024*1024+1),"video/mp4")).rejects.toMatchObject({code:"FILE_TOO_LARGE"});
  await expect(decodeChatVideo(Buffer.from("not mp4"),"video/webm")).rejects.toMatchObject({code:"VALIDATION_ERROR"});
});
it("fully decodes an MP4 and returns a real JPEG poster and dimensions",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"chat-video-test-"));
  try {
    const path=join(dir,"sample.mp4");
    await promisify(execFile)(process.env.FFMPEG_PATH||"ffmpeg",["-v","error","-f","lavfi","-i","color=c=blue:s=64x48:d=1","-c:v","libx264","-pix_fmt","yuv420p",path],{windowsHide:true,timeout:15000});
    const result=await decodeChatVideo(await readFile(path),"video/mp4");
    expect(result).toMatchObject({kind:"video",mimeType:"video/mp4",width:64,height:48,durationMs:1000});
    expect((await sharp(result.posterBytes).metadata()).format).toBe("jpeg");
    await expect(decodeChatVideo(Buffer.from("corrupt MP4"),"video/mp4")).rejects.toMatchObject({code:"VALIDATION_ERROR"});
  } finally {await rm(dir,{recursive:true,force:true});}
},30000);
