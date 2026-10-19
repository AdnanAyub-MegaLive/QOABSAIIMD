import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { db, viewer } = vi.hoisted(() => ({ db: {}, viewer: { id: "viewer", publicId: "USR-viewer" } }));
vi.mock("./prisma.js", () => ({ prisma: db }));
vi.mock("./progression.js", () => ({ publicProgression: async () => new Map() }));
vi.mock("./mobile-api", () => ({ requireMobileUser: async () => viewer, mobileOptions: () => new Response(null), mobileJson: (body, status=200) => Response.json(body,{status}), mobileApiError: () => Response.json({success:false},{status:500}) }));
import { resolveUserPerks } from "./user-perks.js";
import { equippedProfileAssets } from "./public-profile.js";
import { serializeRoomChatMessages } from "./audio-room-chat.js";
import { chatSenderPerks, invalidateChatPerks } from "./chat-perks-cache.js";
import { GET as conversations } from "../app/api/conversations/route.js";

const users = [1,2,3].map(n => ({ id:`u${n}`, publicId:`USR-${n}`, name:`User ${n}` }));
let assets, equipped;
beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "test-only");
  assets = ["BADGES","FRAMES","ROOM_BACKGROUNDS"].map(category => ({ id:`global-${category}`, publicId:`AST-global-${category}`, category, isGlobal:true, mimeType:"image/png", assignments:[] }));
  assets.push({id:"owned",publicId:"AST-owned",category:"BADGES",isGlobal:false,mimeType:"application/svga",assignments:[{userId:"u3"}]});
  equipped = [{userId:"u3",category:"BADGES",assetId:"owned"}];
  db.uploadAsset={findMany:vi.fn(async({where})=>assets.filter(a=>!where.publicId||where.publicId.in.includes(a.publicId)))};
  db.userEquippedProp={findMany:vi.fn(async({where})=>equipped.filter(e=>where.userId.in.includes(e.userId)&&where.category.in.includes(e.category)).map(e=>({...e,asset:assets.find(a=>a.id===e.assetId)})))};
  db.conversation={upsert:async()=>({id:"world"}),findMany:async()=>users.map(u=>({id:`c-${u.id}`,publicId:`CONV-${u.id}`,kind:"DIRECT",createdAt:new Date(),messages:[],participants:[{userId:viewer.id,user:viewer},{userId:u.id,user:u}]}))};
  db.conversationParticipant={upsert:async()=>({})}; db.userBlock={findMany:async()=>[]}; db.message={count:async()=>0};
  users.forEach(u=>invalidateChatPerks(u.id));
});
afterEach(()=>vi.unstubAllEnvs());

it("chat list, room chat and profile show no badge without equipment despite a global badge",async()=>{
  const response=await conversations(new Request("https://portal.test/api/conversations"));
  expect(response.status).toBe(200);
  const list=(await response.json()).data.conversations;
  const room=await serializeRoomChatMessages(users.map(u=>({sender:u,senderPublicId:u.publicId,publicId:`MSG-${u.id}`,createdAt:new Date(),body:"Hello"})),"https://portal.test");
  const profiles=await equippedProfileAssets(users,"https://portal.test",db);
  for(let i=0;i<2;i++){
    expect(list[i].participant.badgeUrl).toBeNull();
    expect(room[i].sender.badgeUrl).toBeNull();
    expect(profiles.get(users[i].id).profileBadge).toBeNull();
    expect((await chatSenderPerks(users[i],"https://portal.test")).badgeUrl).toBeNull();
  }
  expect(list[2].participant.badgeUrl).toContain("AST-owned");
  expect(room[2].sender.badgeUrl).toContain("AST-owned");
  expect(profiles.get("u3").profileBadge.url).toContain("AST-owned");
});
it("global availability never supplies unequipped frames or room backgrounds",async()=>{
  const perks=await resolveUserPerks(users,"https://portal.test");
  for(const u of users){expect(perks.get(u.publicId).frameUrl).toBeNull();expect(perks.get(u.publicId).roomBackgroundUrl).toBeNull();}
});
it("an explicitly equipped global badge works without a private assignment",async()=>{
  equipped.push({userId:"u1",category:"BADGES",assetId:"global-BADGES"});
  expect((await resolveUserPerks(users,"https://portal.test")).get("USR-1").badgeUrl).toContain("AST-global-BADGES");
  expect((await equippedProfileAssets(users,"https://portal.test",db)).get("u1").profileBadge.url).toContain("AST-global-BADGES");
});
it("an expired or another user's assignment never falls back to a global badge",async()=>{
  equipped.push({userId:"u1",category:"BADGES",assetId:"owned"});
  assets.find(a=>a.id==="owned").assignments=[]; // expired assignments are excluded by the DB query
  const perks=await resolveUserPerks(users,"https://portal.test");
  expect(perks.get("USR-1").badgeUrl).toBeNull();
  expect(perks.get("USR-3").badgeUrl).toBeNull();
  expect(db.uploadAsset.findMany.mock.calls[0][0].where.OR[1].assignments.some.OR).toEqual([{expiresAt:null},{expiresAt:{gt:expect.any(Date)}}]);
});
