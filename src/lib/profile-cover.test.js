import { it, expect, vi } from "vitest";
import sharp from "sharp";
import { decodeProfileCover, profileCoverDto, coverToken, verifyCoverToken } from "./profile-cover.js";
it("decodes and resizes real images and rejects corrupt/mismatched images",async()=>{
 const bytes=await sharp({create:{width:1500,height:500,channels:3,background:"red"}}).png().toBuffer();
 const output=await decodeProfileCover(new File([bytes],"a.png",{type:"image/png"}));
 expect((await sharp(output).metadata()).width).toBe(1080);
 await expect(decodeProfileCover(new File([bytes],"a.jpg",{type:"image/jpeg"}))).rejects.toThrow();
 await expect(decodeProfileCover(new File(["bad"],"a.png",{type:"image/png"}))).rejects.toThrow();
 await expect(decodeProfileCover({type:"image/png",size:9*1024*1024})).rejects.toMatchObject({code:"FILE_TOO_LARGE"});
});
it("hides pending covers from other viewers and signs owner previews",async()=>{
 vi.stubEnv("AUTH_SECRET","test-cover-secret");
 const db={profileCoverItem:{findMany:async()=>[]},profileCover:{findUnique:async()=>({status:"PENDING",revision:"r"})}};
 expect((await profileCoverDto(db,"owner","viewer","https://portal.example")).coverImageUrl).toBeNull();
 expect((await profileCoverDto(db,"owner","owner","https://portal.example")).coverStatus).toBe("PENDING");
 const token=coverToken("owner","viewer","r");expect(verifyCoverToken(token).revision).toBe("r");expect(verifyCoverToken(token+"bad")).toBeNull();vi.unstubAllEnvs();
});
it("keeps GIF bytes and frame count intact",async()=>{
 const bytes=await sharp(Buffer.from([255,0,0,0,255,0]),{raw:{width:1,height:2,channels:3,pageHeight:1}}).gif({delay:[100,100],loop:0}).toBuffer();
 const output=await decodeProfileCover(new File([bytes],"a.gif",{type:"image/gif"}));
 expect(output.equals(bytes)).toBe(true);
 expect((await sharp(output,{animated:true}).metadata()).pages).toBe(2);
});
it("orders legacy and carousel covers by creation time and filters public requests",async()=>{
 vi.stubEnv("AUTH_SECRET","test-cover-secret");
 const findMany=vi.fn(async()=>[{id:"older",createdAt:new Date("2026-01-01"),mimeType:"image/gif",status:"APPROVED",revision:"a"}]);
 const db={profileCoverItem:{findMany},profileCover:{findUnique:async()=>({createdAt:new Date("2026-02-01"),mimeType:"image/webp",status:"APPROVED",revision:"b"})}};
 const dto=await profileCoverDto(db,"owner","viewer","https://portal.test");
 expect(dto.covers.map(c=>c.id)).toEqual(["older","legacy"]);
 expect(dto.covers[0].coverMimeType).toBe("image/gif");
 expect(findMany).toHaveBeenCalledWith(expect.objectContaining({where:{userId:"owner",status:"APPROVED"}}));
 vi.unstubAllEnvs();
});
