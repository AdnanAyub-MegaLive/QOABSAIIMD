import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mocks=vi.hoisted(()=>({findUnique:vi.fn(),user:vi.fn(),auth:vi.fn()}));
vi.mock("../../auth",()=>({auth:mocks.auth}));
vi.mock("./prisma",()=>({prisma:{uploadAsset:{findUnique:mocks.findUnique},user:{findUnique:mocks.user}}}));
import { GET } from "../app/api/uploads/[assetId]/file/route.js";
import { createPublicDisplayAssetUrl, createSignedAssetUrl } from "./upload-assets.js";
const asset={publicId:"AST-1",mediaVersion:"abc",posterMediaVersion:"def",category:"GIFTS",active:true,isGlobal:true,mimeType:"image/gif",fileName:"gift.gif",assignments:[]};
beforeEach(()=>{
 vi.stubEnv("AUTH_SECRET","test-media-key");vi.stubEnv("MEDIA_CDN_ENABLED","false");
 mocks.auth.mockResolvedValue(null);
 mocks.findUnique.mockReset().mockResolvedValue({...asset,fileData:Buffer.from("gif"),posterFileData:Buffer.from("poster")});
});
afterEach(()=>vi.unstubAllEnvs());
const get=(ttl=3600,headers={},v="abc")=>GET(new Request(createPublicDisplayAssetUrl("https://portal.test","AST-1",ttl,v),{headers}),{params:Promise.resolve({assetId:"AST-1"})});
it('serves agency artwork without Bearer only with a valid current signed URL',async()=>{
 mocks.findUnique.mockResolvedValue({...asset,category:'AGENCY_ARTWORK',mimeType:'image/webp',fileData:Buffer.from('image')});
 const response=await get();expect(response.status).toBe(200);expect(await response.text()).toBe('image');
 expect((await get(-1)).status).toBe(401);
 expect((await get(3600,{},'old')).status).toBe(409);
 const url=new URL(createPublicDisplayAssetUrl('https://portal.test','AST-1',3600,'abc'));url.searchParams.set('displaySig','invalid');
 expect((await GET(new Request(url),{params:Promise.resolve({assetId:'AST-1'})})).status).toBe(401);
 expect((await GET(new Request('https://portal.test/api/uploads/AST-1/file'),{params:Promise.resolve({assetId:'AST-1'})})).status).toBe(401);
 mocks.findUnique.mockResolvedValue({...asset,category:'AGENCY_ARTWORK',active:false});expect((await get()).status).toBe(401);
});
it("serves matching public versions immutable with MIME and ETag",async()=>{
 const response=await get();expect(response.status).toBe(200);
 expect(response.headers.get("etag")).toBe('"abc"');
 expect(response.headers.get("content-type")).toBe("image/gif");
 expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
});
it("returns a bodyless 304 only after authorization",async()=>{
 const response=await get(3600,{"If-None-Match":'"abc"'});
 expect(response.status).toBe(304);expect(await response.text()).toBe("");
 expect((await get(-1,{"If-None-Match":'"abc"'})).status).toBe(401);
});
it("never serves replacement bytes under an old immutable version",async()=>{
 expect((await get(3600,{},"old")).status).toBe(409);
 mocks.findUnique.mockResolvedValueOnce(asset).mockResolvedValueOnce({...asset,mediaVersion:"new",fileData:Buffer.from("new")});
 expect((await get()).status).toBe(409);
});
it("keeps private artwork out of shared immutable caches",async()=>{
 mocks.findUnique.mockResolvedValue({...asset,isGlobal:false,fileData:Buffer.from("private")});
 expect((await get()).headers.get("cache-control")).toBe("private, no-cache");
});
it("serves current-version signed URLs after forced logout but rejects revoked, expired or unowned access",async()=>{
 const user={id:"u",status:"ACTIVE",deletedAt:null,sessionVersion:3,forcedLogoutAt:new Date()};
 mocks.user.mockResolvedValue(user);
 mocks.findUnique.mockResolvedValue({...asset,isGlobal:false,storeVisible:false,assignments:[{userId:"u"}],fileData:Buffer.from("private")});
 const signed=(version=3,ttl=3600)=>GET(new Request(createSignedAssetUrl("https://portal.test",asset.publicId,"USR-1",version,ttl,"abc")),{params:Promise.resolve({assetId:asset.publicId})});
 const response=await signed();expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-cache");
 expect((await signed(2)).status).toBe(401);
 expect((await signed(3,-1)).status).toBe(401);
 mocks.findUnique.mockResolvedValue({...asset,isGlobal:false,storeVisible:false,assignments:[]});
 expect((await signed()).status).toBe(401);
});
