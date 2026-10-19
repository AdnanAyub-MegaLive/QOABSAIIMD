import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({db:{},object:vi.fn()}));
vi.mock("./prisma.js",()=>({prisma:m.db}));
vi.mock("./mobile-api",()=>({requireMobileUser:async()=>({id:"member"}),mobileOptions:()=>new Response(null),mobileJson:(body,status=200)=>Response.json(body,{status}),mobileApiError:e=>Response.json({error:{code:e.code}},{status:e.code==="CONVERSATION_NOT_FOUND"||e.code==="MESSAGE_NOT_FOUND"?404:403})}));
vi.mock("./chat-media.js",async original=>({...await original(),privateChatObject:m.object}));
import {GET as details} from "../app/api/v1/conversations/[conversationId]/route.js";
import {GET as icon} from "../app/api/v1/conversations/[conversationId]/icon/[iconId]/route.js";
beforeEach(()=>{
  const group={id:"db-group",publicId:"CONV-g",name:"Group",kind:"GROUP",description:"Description",iconId:"new-icon",revision:2,createdAt:new Date(),participants:[{userId:"member",role:"MEMBER",user:{publicId:"USR-member",name:"Member"},joinedAt:new Date()},{userId:"owner",role:"OWNER",user:{publicId:"USR-owner",name:"Owner"},joinedAt:new Date()}]};
  m.db.user={findFirst:vi.fn(async()=>({id:"member"}))};
  m.db.conversation={findUnique:vi.fn(async()=>group)};
  m.db.groupIcon={findFirst:vi.fn(async()=>({id:"old-icon",key:"private-chat/test.webp"}))};
  m.object.mockReset().mockResolvedValue({Body:{transformToWebStream:()=>new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2]));c.close();}})}});
});
const context={params:Promise.resolve({conversationId:"CONV-g",iconId:"old-icon"})};
it("returns group details with icon, description and current owner",async()=>{
  const response=await details(new Request("https://portal.test/api/v1/conversations/CONV-g"),context);
  expect(response.status).toBe(200);
  expect((await response.json()).data.conversation).toMatchObject({description:"Description",iconUrl:"/api/v1/conversations/CONV-g/icon/new-icon",owner:{publicId:"USR-owner"},revision:2});
});
it("serves retired icons privately and requires published, unexpired group-scoped records",async()=>{
  const response=await icon(new Request("https://portal.test/icon/old-icon"),context);
  expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(m.db.groupIcon.findFirst).toHaveBeenCalledWith({where:{id:"old-icon",conversationId:"db-group",publishedAt:{not:null},OR:[{expiresAt:null},{expiresAt:{gt:expect.any(Date)}}]}});
  m.db.groupIcon.findFirst.mockResolvedValue(null);
  expect((await icon(new Request("https://portal.test/icon/old-icon"),context)).status).toBe(404);
});
it("removed members and banned accounts cannot access an icon",async()=>{
  const group=await m.db.conversation.findUnique();group.participants=group.participants.filter(p=>p.userId!=="member");
  expect((await icon(new Request("https://portal.test/icon/old-icon"),context)).status).toBe(404);
  expect(m.object).not.toHaveBeenCalled();
  m.db.user.findFirst.mockResolvedValue(null);
  expect((await icon(new Request("https://portal.test/icon/old-icon"),context)).status).toBe(403);
});
