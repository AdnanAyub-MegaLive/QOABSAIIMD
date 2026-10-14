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
 const db={profileCover:{findUnique:async()=>({status:"PENDING",revision:"r"})}};
 expect((await profileCoverDto(db,"owner","viewer","https://portal.example")).coverImageUrl).toBeNull();
 expect((await profileCoverDto(db,"owner","owner","https://portal.example")).coverStatus).toBe("PENDING");
 const token=coverToken("owner","viewer","r");expect(verifyCoverToken(token).revision).toBe("r");expect(verifyCoverToken(token+"bad")).toBeNull();vi.unstubAllEnvs();
});
