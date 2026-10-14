import { describe, it, expect, vi } from "vitest";
import { mediaVersion, versionUploadData, versionedUrl } from "./media-version.js";
vi.mock("./prisma.js",()=>({prisma:{}}));
import { versionMediaPayload } from "./media-payload.js";
import { hashGiftCatalog } from "./gift-catalog-version.js";
import { createPublicDisplayAssetUrl, verifyPublicDisplayAssetUrl } from "./upload-assets.js";
describe("content media versions",()=>{
 it("hashes bytes, not names or signing expiry, with independent posters",()=>{
  expect(mediaVersion(Buffer.from("abc"))).toBe("ba7816bf8f01cfea");
  const result=versionUploadData({fileData:Buffer.from("abc"),posterFileData:Buffer.from("poster"),cdnUrl:"old"});
  expect(result.mediaVersion).toBe("ba7816bf8f01cfea");
  expect(result.posterMediaVersion).not.toBe(result.mediaVersion);
  expect(result.cdnUrl).toBeNull();
  expect(versionUploadData({name:"new"})).toEqual({name:"new"});
  expect(versionUploadData({posterFileData:{set:null}}).posterMediaVersion).toBeNull();
 });
 it("ignores unsafe versions and preserves signing parameters",()=>{
  expect(versionedUrl("/file?sig=test","bad value")).toBe("/file?sig=test");
  expect(versionedUrl("/file?sig=test","abc")).toBe("/file?sig=test&v=abc");
 });
 it("batches nested media and uses the poster's own version",async()=>{
  const db={uploadAsset:{findMany:vi.fn().mockResolvedValue([{publicId:"AST-1",mediaVersion:"abc",posterMediaVersion:"def"}])}};
  const result=await versionMediaPayload({items:[{mediaUrl:"/api/uploads/AST-1/file?displaySig=x",posterUrl:"/api/uploads/AST-1/file?poster=1"}]},db);
  expect(db.uploadAsset.findMany).toHaveBeenCalledTimes(1);
  expect(result.items[0]).toMatchObject({mediaVersion:"abc",posterMediaVersion:"def"});
  expect(result.items[0].mediaUrl).toContain("v=abc");
  expect(result.items[0].posterUrl).toContain("v=def");
 });
 it("keeps signature validation independent of v without accepting expiry",()=>{
  vi.stubEnv("AUTH_SECRET","test-secret");
  try {
   for(const ttl of [3600,-1]){
    const url=new URL(createPublicDisplayAssetUrl("https://portal.test",{publicId:"AST-1",mediaVersion:"abc"},ttl));
    expect(url.searchParams.get("v")).toBe("abc");
    expect(Boolean(verifyPublicDisplayAssetUrl("AST-1",{expiresAt:url.searchParams.get("displayExp"),signature:url.searchParams.get("displaySig")}))).toBe(ttl>0);
   }
  } finally {vi.unstubAllEnvs();}
 });
 it("catalog hash is stable and changes for price or bytes",()=>{
  const a={publicId:"AST-1",mediaVersion:"abc",coinPrice:1n,active:true,giftTier:"NORMAL"};
  const b={...a,publicId:"AST-2"};
  expect(hashGiftCatalog([a,b])).toBe(hashGiftCatalog([b,a]));
  expect(hashGiftCatalog([a])).not.toBe(hashGiftCatalog([{...a,coinPrice:2n}]));
  expect(hashGiftCatalog([a])).not.toBe(hashGiftCatalog([{...a,mediaVersion:"def"}]));
 });
});
