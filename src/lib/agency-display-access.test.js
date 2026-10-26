import {beforeEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({asset:vi.fn()}));
vi.mock("../../auth",()=>({auth:async()=>null}));
vi.mock("./prisma",()=>({prisma:{uploadAsset:{findUnique:m.asset}}}));
vi.mock("./media-cdn-policy",()=>({publicCdnUrl:()=>null,canPublishMedia:()=>false}));
import {createPublicDisplayAssetUrl} from "./upload-assets";
import {GET} from "../app/api/uploads/[assetId]/file/route.js";
const asset={publicId:"AST-LOGO",category:"AGENCY_ARTWORK",active:true,mimeType:"image/webp",fileName:"logo.webp",mediaVersion:"v1",fileData:Buffer.from("image"),assignments:[]};
beforeEach(()=>{vi.stubEnv("AUTH_SECRET","test-only-signature");m.asset.mockReset();m.asset.mockResolvedValue(asset);});
const url=()=>createPublicDisplayAssetUrl("https://portal.test",{publicId:"AST-LOGO",mediaVersion:"v1"});
const get=address=>GET(new Request(address),{params:Promise.resolve({assetId:"AST-LOGO"})});
it("serves signed active agency image without bearer authorization",async()=>{
  const response=await get(url());expect(response.status).toBe(200);expect(await response.text()).toBe("image");
});
it.each(["missing","invalid","expired","inactive"])("rejects %s display access",async mode=>{
  const address=new URL(url());
  if(mode==="missing"){address.searchParams.delete("displaySig");address.searchParams.delete("displayExp");}
  if(mode==="invalid")address.searchParams.set("displaySig","invalid");
  if(mode==="expired")address.searchParams.set("displayExp","1");
  if(mode==="inactive")m.asset.mockResolvedValue({...asset,active:false});
  expect((await get(address)).status).toBe(401);
});
it("rejects stale content versions",async()=>{
  const address=new URL(url());address.searchParams.set("v","old");expect((await get(address)).status).toBe(409);
});
