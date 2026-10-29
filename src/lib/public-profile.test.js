import { describe, expect, it, vi } from "vitest";
vi.mock("./prisma.js", () => ({ prisma: {} }));
import { publicAge, wallCursor, wallOffset, ownedProfileBadges, ownedProfileProps, receivedGiftWall } from "./public-profile.js";
describe("profile contract helpers", () => {
  it("returns a signed, independently versioned MP4 poster without changing gift media",async()=>{
    vi.stubEnv('AUTH_SECRET','test-only-secret');
    try{
      const asset={id:'gift',publicId:'AST-gift',name:'Gift',active:true,mimeType:'video/mp4',posterMimeType:'image/webp',posterMediaVersion:'fedcba9876543210'};
      const db={giftTransaction:{groupBy:vi.fn(async()=>[{giftAssetId:'gift',_sum:{quantity:2,coinValue:100n}}])},uploadAsset:{findMany:vi.fn(async()=>[asset])}};
      const {items}=await receivedGiftWall('user','https://portal.example',{},db);
      expect(items[0]).toMatchObject({giftId:'AST-gift',mimeType:'video/mp4',posterMimeType:'image/webp',quantity:2,totalCoins:'100'});
      const poster=new URL(items[0].posterUrl);
      expect(poster.searchParams.get('poster')).toBe('1');
      expect(poster.searchParams.get('v')).toBe(asset.posterMediaVersion);
      expect(poster.searchParams.has('displaySig')).toBe(true);
      expect(new URL(items[0].mediaUrl).searchParams.has('poster')).toBe(false);
      asset.posterMimeType=null;
      expect((await receivedGiftWall('user','https://portal.example',{},db)).items[0].posterUrl).toBeNull();
      asset.posterMimeType='image/png';asset.active=false;
      expect((await receivedGiftWall('user','https://portal.example',{},db)).items[0]).toMatchObject({mediaUrl:null,posterUrl:null});
    }finally{vi.unstubAllEnvs();}
  });
  it("returns owned props without financial or assignment metadata",async()=>{
    vi.stubEnv("AUTH_SECRET","test-only-secret");
    try{
      const findMany=vi.fn(async()=>[{expiresAt:null,source:"PRIVATE",purchasePrice:100,asset:{publicId:"AST-frame",name:"Frame",category:"FRAMES",mimeType:"application/svga",mediaVersion:"abc"}}]);
      const items=await ownedProfileProps("target","https://portal.example",{uploadAssetAssignment:{findMany}});
      expect(findMany.mock.calls[0][0]).toMatchObject({where:{userId:"target",asset:{active:true}},take:100,orderBy:[{assignedAt:"desc"},{assetId:"asc"}]});
      expect(items[0]).toMatchObject({category:"FRAMES",assetId:"AST-frame",expiresAt:null});
      expect(items[0]).not.toHaveProperty("source");expect(items[0]).not.toHaveProperty("purchasePrice");
      expect(new URL(items[0].url).searchParams.has("displaySig")).toBe(true);
    }finally{vi.unstubAllEnvs();}
  });
  it("queries only the target's active unexpired badges, bounded and newest first", async () => {
    vi.stubEnv("AUTH_SECRET", "test-only-secret");
    try {
      const asset = { publicId: "AST-badge", name: "Badge", mimeType: "application/svga", mediaVersion: "0123456789abcdef", posterMimeType: "image/webp", posterMediaVersion: "fedcba9876543210" };
      const findMany = vi.fn().mockResolvedValue([{ asset, expiresAt: new Date("2027-01-01T00:00:00Z") }]);
      const items = await ownedProfileBadges("target", "https://portal.example", { uploadAssetAssignment: { findMany } });
      expect(findMany.mock.calls[0][0]).toMatchObject({ where: { userId: "target", asset: { active: true, category: "BADGES" }, OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }] }, take: 50, orderBy: [{ assignedAt: "desc" }, { assetId: "asc" }] });
      expect(items[0]).toMatchObject({ assetId: "AST-badge", name: "Badge", mimeType: "application/svga", expiresAt: "2027-01-01T00:00:00.000Z" });
      const url = new URL(items[0].url);
      expect(url.searchParams.has("displaySig")).toBe(true);
      expect(url.searchParams.has("uid")).toBe(false);
      expect(new URL(items[0].posterUrl).searchParams.get("v")).toBe(asset.posterMediaVersion);
      findMany.mockResolvedValue([]);
      expect(await ownedProfileBadges("target", "https://portal.example", { uploadAssetAssignment: { findMany } })).toEqual([]);
    } finally { vi.unstubAllEnvs(); }
  });
  it("never calculates public age when birth date is private", () => {
    expect(publicAge(new Date("2000-10-25"), false)).toBeNull();
    expect(publicAge(new Date("2000-10-25"), true, new Date("2026-10-08"))).toBe(25);
    expect(publicAge(new Date("2000-10-25"), true, new Date("2026-10-25"))).toBe(26);
  });
  it("validates opaque wall cursors", () => {
    expect(wallOffset(wallCursor(20))).toBe(20);
    expect(() => wallOffset("invalid")).toThrow("INVALID_CURSOR");
    expect(() => wallOffset(wallCursor(-1))).toThrow("INVALID_CURSOR");
  });
});
