import {it,expect} from "vitest";
import sharp from "sharp";
import {decodeLiveCover,COVER_LIMIT} from "./video-cover.js";
it("preserves animated GIF room cover bytes",async()=>{
 const gif=await sharp(Buffer.from([255,0,0,0,255,0]),{raw:{width:1,height:2,channels:3,pageHeight:1}}).gif({delay:[100,100],loop:0}).toBuffer();
 const result=await decodeLiveCover(gif,"image/gif");expect(result.equals(gif)).toBe(true);expect((await sharp(result,{animated:true}).metadata()).pages).toBe(2);
 expect(COVER_LIMIT).toBe(10*1024*1024);
 await expect(decodeLiveCover(Buffer.from("GIF89a malformed"),"image/gif")).rejects.toThrow();
 await expect(decodeLiveCover(gif,"image/jpeg")).rejects.toThrow();
});
