import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({findMany:vi.fn(),auth:vi.fn()}));
vi.mock("@/lib/prisma",()=>({prisma:{uploadAsset:{findMany:mocks.findMany}}}));
vi.mock("./prisma.js",()=>({prisma:{uploadAsset:{findMany:mocks.findMany}}}));
vi.mock("@/lib/mobile-api",()=>({requireMobileUser:mocks.auth,mobileApiError:()=>Response.json({success:false},{status:401})}));
vi.mock("@/lib/user-perks",()=>({requestOrigin:request=>new URL(request.url).origin}));
vi.mock("@/lib/mobile-v1",()=>({withV1Request:(request,options,handler)=>handler({}),v1Options:()=>new Response(null)}));
import { assetAddress, portalAssetUrl } from "./asset-address.js";
import { assetPriority, buildAssetManifest, cachedAssetManifest, clearAssetManifestCache, manifestVersionFor, manifestWhereAt, isManifestAsset } from "./asset-manifest.js";
import { versionMediaPayload } from "./media-payload.js";
import { GET } from "../app/api/v1/assets/manifest/route.js";
const row=(over={})=>({publicId:"AST-1",category:"GIFTS",mimeType:"application/svga",fileSize:100,mediaVersion:"aaaa",posterMimeType:null,posterFileSize:null,posterMediaVersion:null,cdnUrl:null,posterCdnUrl:null,active:true,isGlobal:true,storeVisible:false,audioRoomId:null,sortOrder:0,...over});
const origin="https://portal.test";
afterEach(()=>{vi.unstubAllEnvs();});
beforeEach(()=>{vi.clearAllMocks();clearAssetManifestCache();mocks.auth.mockResolvedValue({id:"u"});});
describe("asset address",()=>{
 it("builds a versioned Portal URL without CDN",()=>{
  expect(assetAddress(row(),{origin})).toBe("https://portal.test/api/uploads/AST-1/file?v=aaaa");
  expect(portalAssetUrl(origin,row({posterMimeType:"image/png",posterMediaVersion:"bbbb"}),{poster:true})).toBe("https://portal.test/api/uploads/AST-1/file?poster=1&v=bbbb");
 });
 it("prefers the CDN when enabled and returns null for missing posters",()=>{
  vi.stubEnv("MEDIA_CDN_ENABLED","true");vi.stubEnv("MEDIA_CDN_BASE_URL","https://media.megachat.live");
  const cdn="https://media.megachat.live/portal-media/AST-1/abc.svga?v=aaaa";
  expect(assetAddress(row({cdnUrl:cdn}),{origin})).toBe(cdn);
  expect(assetAddress(row({cdnUrl:"https://evil.test/portal-media/x"}),{origin})).toBe("https://portal.test/api/uploads/AST-1/file?v=aaaa");
  expect(assetAddress(row(),{origin,poster:true})).toBeNull();
 });
});
const now=new Date("2026-11-25T00:00:00Z");
function matches(item,where){return Object.entries(where).every(([key,cond])=>{
 if(key==="OR")return cond.some(c=>matches(item,c));
 if(key==="AND")return cond.every(c=>matches(item,c));
 const value=item[key];
 if(cond===null)return value==null;
 if(typeof cond!=="object"||cond instanceof Date)return value===cond;
 if("some" in cond)return (value??[]).some(child=>matches(child,cond.some));
 if(value&&typeof value==="object"&&!(value instanceof Date)&&!Array.isArray(value))return matches(value,cond);
 return Object.entries(cond).every(([op,arg])=>op==="in"?arg.includes(value):op==="notIn"?!arg.includes(value):op==="not"?(arg===null?value!=null:value!==arg):op==="gt"?value!=null&&value>arg:false);
});}
const full=(over={})=>({...row({isGlobal:false,storeVisible:false,category:"FRAMES",mimeType:"image/png"}),archivedAt:null,giftTier:null,coinPrice:null,assignments:[],vipBenefits:[],levelTagBackgrounds:[],...over});
describe("manifest exposure rule",()=>{
 const allowed=item=>matches(item,manifestWhereAt(now));
 it("refuses unowned manual display assets and expired assignments",()=>{
  expect(allowed(full())).toBe(false);
  expect(allowed(full({assignments:[{expiresAt:new Date("2026-01-01")}]}))).toBe(false);
  expect(allowed(full({vipBenefits:[{tier:{active:false}}]}))).toBe(false);
 });
 it.each([["global",{isGlobal:true}],["store",{storeVisible:true}],["assigned",{assignments:[{expiresAt:null}]}],["assigned-until-later",{assignments:[{expiresAt:new Date("2027-01-01")}]}],["vip",{vipBenefits:[{tier:{active:true}}]}],["level",{levelTagBackgrounds:[{}]}]])("allows %s assets",(_,over)=>{expect(allowed(full(over))).toBe(true);});
 it("applies the gift catalog rule",()=>{
  expect(allowed(full({category:"GIFTS",giftTier:"CLASSIC",coinPrice:10n}))).toBe(true);
  expect(allowed(full({category:"GIFTS",giftTier:"CLASSIC",coinPrice:0n,isGlobal:true}))).toBe(false);
  expect(allowed(full({category:"GIFTS",giftTier:"OTHER",coinPrice:10n,isGlobal:true}))).toBe(false);
  expect(allowed(full({category:"LIVE_GIFTS",coinPrice:5n}))).toBe(true);
  expect(allowed(full({category:"LIVE_GIFTS",coinPrice:0n,isGlobal:true}))).toBe(false);
 });
 it("requires media type, version, activity",()=>{
  expect(allowed(full({isGlobal:true,mimeType:"audio/mpeg"}))).toBe(false);
  expect(allowed(full({isGlobal:true,mediaVersion:null}))).toBe(false);
  expect(allowed(full({isGlobal:true,archivedAt:now}))).toBe(false);
  expect(allowed(full({isGlobal:true,category:"AVATARS"}))).toBe(false);
 });
 it("isManifestAsset uses the same where clause",async()=>{
  const findFirst=vi.fn(async({where})=>[full({publicId:"A"}),full({publicId:"B",isGlobal:true})].find(item=>matches(item,where))??null);
  expect(await isManifestAsset("A",{db:{uploadAsset:{findFirst}},now})).toBe(false);
  expect(await isManifestAsset("B",{db:{uploadAsset:{findFirst}},now})).toBe(true);
  expect(findFirst.mock.calls[0][0].select).toEqual({publicId:true});
 });
});
describe("asset manifest",()=>{
 it("filters public media without selecting bytes",async()=>{
  mocks.findMany.mockResolvedValue([]);
  await buildAssetManifest(origin);
  const args=mocks.findMany.mock.calls[0][0];
  expect(args.select.fileData).toBeUndefined();expect(args.select.posterFileData).toBeUndefined();
  expect(Object.values(args.select).every(Boolean)).toBe(true);
  expect(args.where.archivedAt).toBeNull();
  for(const excluded of ["AVATARS","CP_MEDIA","MUSIC_TRACKS","APK","KYC"])expect(args.where.category.in).not.toContain(excluded);
  expect([...args.where.mimeType.in].sort()).toEqual(["application/svga","image/gif","image/jpeg","image/png","image/webp","video/mp4"]);
 });
 it("orders by priority and has a stable version",async()=>{
  mocks.findMany.mockResolvedValue([row({publicId:"AST-3",category:"ROOM_BACKGROUNDS",mimeType:"video/mp4",posterMimeType:"image/png",posterFileSize:9,posterMediaVersion:"pppp"}),row({publicId:"AST-2",category:"FRAMES"}),row()]);
  const manifest=await buildAssetManifest(origin,{now:new Date("2026-11-25T00:00:00Z")});
  expect(manifest.assets.map(a=>[a.assetId,a.priority])).toEqual([["AST-1",1],["AST-2",2],["AST-3",3]]);
  expect(manifest.assets[2]).toMatchObject({posterVersion:"pppp",posterSize:9,posterUrl:"https://portal.test/api/uploads/AST-3/file?poster=1&v=pppp",kind:"video/mp4"});
  expect(manifest.assets[0].posterUrl).toBeUndefined();
  expect(manifest.manifestVersion).toBe(manifestVersionFor([...manifest.assets].reverse()));
  expect(assetPriority("BANNERS")).toBe(3);
 });
 it("serves ETag and 304",async()=>{
  mocks.findMany.mockResolvedValue([row()]);
  const first=await GET(new Request(`${origin}/api/v1/assets/manifest?appVersion=2.0.4`));
  const body=await first.json();
  expect(first.status).toBe(200);
  expect(first.headers.get("ETag")).toBe(`"${body.data.manifestVersion}"`);
  expect(first.headers.get("Cache-Control")).toBe("private, no-cache");
  expect(body.data.assets[0]).toEqual({assetId:"AST-1",version:"aaaa",kind:"application/svga",size:100,url:"https://portal.test/api/uploads/AST-1/file?v=aaaa",category:"GIFTS",priority:1});
  const second=await GET(new Request(`${origin}/api/v1/assets/manifest`,{headers:{"If-None-Match":first.headers.get("ETag")}}));
  expect(second.status).toBe(304);
  expect(mocks.findMany).toHaveBeenCalledTimes(1);
 });
 it("caches per origin for 60 seconds",async()=>{
  mocks.findMany.mockResolvedValue([row()]);
  await cachedAssetManifest(origin,{now:0});await cachedAssetManifest(origin,{now:59999});
  expect(mocks.findMany).toHaveBeenCalledTimes(1);
  await cachedAssetManifest("https://other.test",{now:1});expect(mocks.findMany).toHaveBeenCalledTimes(2);
  await cachedAssetManifest(origin,{now:60000});expect(mocks.findMany).toHaveBeenCalledTimes(3);
 });
 it("requires auth and validates appVersion",async()=>{
  expect((await GET(new Request(`${origin}/api/v1/assets/manifest?appVersion=bad`))).status).toBe(422);
  mocks.auth.mockRejectedValue(new Error("INVALID_SESSION"));
  expect((await GET(new Request(`${origin}/api/v1/assets/manifest`))).status).toBe(401);
  expect(mocks.findMany).not.toHaveBeenCalled();
 });
});
describe("payload enrichment",()=>{
 it("adds assetId and mimeType without overwriting existing fields",async()=>{
  const db={uploadAsset:{findMany:vi.fn(async()=>[{publicId:"AST-1",mediaVersion:"abc",posterMediaVersion:"def",mimeType:"video/mp4",posterMimeType:"image/png"}])}};
  const result=await versionMediaPayload({a:{url:"/api/uploads/AST-1/file",posterUrl:"/api/uploads/AST-1/file?poster=1"},b:{iconUrl:"/api/uploads/AST-1/file",mimeType:"keep",assetId:"keep"}},db);
  expect(result.a).toMatchObject({assetId:"AST-1",mimeType:"video/mp4",posterAssetId:"AST-1",posterMimeType:"image/png",mediaVersion:"abc",posterMediaVersion:"def"});
  expect(result.b).toMatchObject({iconAssetId:"AST-1",iconMimeType:"video/mp4",mimeType:"keep",assetId:"keep"});
  const ambiguous=await versionMediaPayload({c:{url:"/api/uploads/AST-1/file",imageUrl:"/api/uploads/AST-2/file"}},db);
  expect(ambiguous.c.assetId).toBeUndefined();expect(ambiguous.c.mimeType).toBeUndefined();expect(ambiguous.c.mediaVersion).toBe("abc");
 });
});
