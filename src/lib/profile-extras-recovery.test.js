import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({covers:vi.fn(),progress:vi.fn(),art:vi.fn(),agency:vi.fn()}));
vi.mock("./prisma.js",()=>({prisma:{}}));
vi.mock("./special-id.js",()=>({activeSpecialIds:async()=>new Map()}));
vi.mock("./profile-agency.js",()=>({profileAgency:m.agency}));
vi.mock("./props-store.js",()=>({equippablePropCategories:["FRAMES"]}));
vi.mock("./decoration-media.js",()=>({decorationMedia:a=>({url:`https://portal.test/${a.publicId}`}),namedDecoration:()=>({})}));
vi.mock("./activity-levels.js",()=>({activityProgress:async()=>({level:2})}));
vi.mock("./profile-card-artwork.js",()=>({profileCardArtwork:m.art}));
vi.mock("./profile-cover.js",()=>({profileCoverDto:m.covers}));
vi.mock("./avatar-history.js",()=>({avatarDisplayUrl:x=>x}));
vi.mock("./upload-assets.js",()=>({createPublicDisplayAssetUrl:()=>"https://portal.test/asset"}));
vi.mock("./progression.js",()=>({publicProgression:m.progress}));
import { profileExtras } from "./public-profile.js";
const database=()=>Object.fromEntries(["userEquippedProp","roleBadge","userMedal","uploadAsset","profileRelationship","user","userBlock","uploadAssetAssignment","giftTransaction"].map(name=>[name,{findMany:vi.fn(async()=>[]),groupBy:vi.fn(async()=>[])}]));
beforeEach(()=>{
  vi.resetAllMocks();vi.spyOn(console,"error").mockImplementation(()=>{});
  m.agency.mockResolvedValue(null);m.art.mockResolvedValue({});m.covers.mockResolvedValue({covers:[{id:"cover"}]});
  m.progress.mockResolvedValue(new Map([["USR-B",{userLevel:8,charmLevel:2}]]));
});
const extras=db=>profileExtras({id:"b",publicId:"USR-B",appRoles:[]},{id:"a"},"https://portal.test",db);
it("preserves levels and covers when agency lookup fails",async()=>{
  m.agency.mockRejectedValue(new Error("agency unavailable"));const result=await extras(database());
  expect(result.userLevel).toBe(8);expect(result.covers).toHaveLength(1);expect(result.unavailableFields).toContain("agency");
});
it("preserves covers and equipment when progression fails",async()=>{
  m.progress.mockRejectedValue(new Error("progression unavailable"));const result=await extras(database());
  expect(result.covers).toHaveLength(1);expect(result.unavailableFields).toContain("userLevel");expect(result.userLevel).toBeUndefined();
});
it("preserves levels when covers fail",async()=>{
  m.covers.mockRejectedValue(new Error("signer unavailable"));const result=await extras(database());
  expect(result.userLevel).toBe(8);expect(result.unavailableFields).toContain("covers");
});
it.each([["userMedal","medalWall"],["userEquippedProp","equippedAssets"],["roleBadge","roleBadges"],["uploadAssetAssignment","ownedProps"]])("isolates %s failure",async(model,field)=>{
  const db=database();db[model].findMany.mockRejectedValue(new Error("unavailable"));const result=await extras(db);
  expect(result.userLevel).toBe(8);expect(result.covers).toHaveLength(1);expect(result.unavailableFields).toContain(field);
});
it("withholds related people when their block filtering fails",async()=>{
  const db=database();db.userBlock.findMany.mockRejectedValue(new Error("blocks failed"));
  db.profileRelationship.findMany.mockResolvedValue([{publicId:"R",leftUserId:"b",left:{id:"b"},right:{id:"c",publicId:"USR-C"},startedAt:new Date()}]);
  const result=await extras(db);expect(result.relationships).toEqual([]);expect(result.unavailableFields).toContain("relationships");expect(result.userLevel).toBe(8);
});
