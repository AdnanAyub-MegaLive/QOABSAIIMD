import {it,expect,vi,beforeEach} from "vitest";
const {db}=vi.hoisted(()=>({db:{}}));
vi.mock("./prisma.js",()=>({prisma:db}));
vi.mock("./chat-word-policy.js",()=>({assertChatWordsAllowed:async()=>{}}));
vi.mock("./user-blocks.js",()=>({assertConversationMessagingAllowed:async()=>{}}));
import {createMessage,emitConversationEvent,syncMessagesForUser} from "./messaging.js";
beforeEach(()=>{
 let row;
 db.user={findUnique:vi.fn(async()=>({country:"PK"})),findMany:vi.fn(async()=>[])};
 Object.assign(db,{message:{findUnique:vi.fn(async()=>row),create:vi.fn(async({data})=>(row={id:"db-id",...data,sender:{publicId:"USR-test",name:"Test"}}))},conversation:{update:vi.fn()},conversationParticipant:{update:vi.fn(),findMany:vi.fn(async()=>[])},messageReceipt:{createMany:vi.fn()}});
 db.$transaction=fn=>fn(db);
});
it("replays same message ID without creating another row and rejects conflicting content",async()=>{
 const room={id:"c",kind:"GROUP"},user={id:"s"};
 const first=await createMessage(room,user,"Hello",null,{clientMessageId:"retry-id"});
 expect(await createMessage(room,user,"Hello",null,{clientMessageId:"retry-id"})).toEqual(first);
 expect(db.message.create).toHaveBeenCalledTimes(1);
 await expect(createMessage(room,user,"Different",null,{clientMessageId:"retry-id"})).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
});
it("world sends avoid participant lookup and receipt fan-out",async()=>{
 await createMessage({id:"world",kind:"WORLD"},{id:"world-test-user"},"Hello");
 expect(db.conversationParticipant.findMany).not.toHaveBeenCalled();expect(db.messageReceipt.createMany).not.toHaveBeenCalled();
 const delivery={emit:vi.fn()},io={to:vi.fn(()=>delivery)};await emitConversationEvent(io,"CONV-WORLD","message:new",{message:{senderCountry:"PK"}});
 expect(io.to).toHaveBeenCalledTimes(1);expect(delivery.emit).toHaveBeenCalledOnce();
 expect(io.to).toHaveBeenCalledWith("conversation:CONV-WORLD:PK");
 expect(db.message.create.mock.calls[0][0].data.senderCountry).toBe("PK");
});
it("blocks missing country and links without writing a message",async()=>{
 db.user.findUnique.mockResolvedValue({country:null});
 await expect(createMessage({id:"world",kind:"WORLD"},{id:"u"},"Hello")).rejects.toMatchObject({code:"COUNTRY_REQUIRED"});
 db.user.findUnique.mockResolvedValue({country:"DE"});
 await expect(createMessage({id:"world",kind:"WORLD"},{id:"u"},"example.pk")).rejects.toMatchObject({code:"LINK_NOT_ALLOWED"});
 expect(db.message.create).not.toHaveBeenCalled();
});
it("applies country visibility to both reconnect cursor lookup and every sync page",async()=>{
 db.message.findFirst=vi.fn(async()=>({id:"cursor",createdAt:new Date()}));
 db.message.findMany=vi.fn(async()=>[]);
 await syncMessagesForUser("u",{cursor:"MSG-pk",limit:10});
 const expected={OR:[{conversation:{kind:{not:"WORLD"}}},{conversation:{kind:"WORLD"},senderCountry:"PK"}]};
 expect(db.message.findFirst.mock.calls[0][0].where.AND).toContainEqual(expected);
 expect(db.message.findMany.mock.calls[0][0].where.AND).toContainEqual(expected);
 expect(db.message.findMany.mock.calls[0][0].orderBy).toEqual([{createdAt:"asc"},{id:"asc"}]);
 db.message.findFirst.mockResolvedValue(null);
 await expect(syncMessagesForUser("u",{cursor:"MSG-other-country"})).rejects.toMatchObject({code:"SYNC_CURSOR_INVALID"});
});
