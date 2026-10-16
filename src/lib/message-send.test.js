import {it,expect,vi,beforeEach} from "vitest";
const {db}=vi.hoisted(()=>({db:{}}));
vi.mock("./prisma.js",()=>({prisma:db}));
vi.mock("./chat-word-policy.js",()=>({assertChatWordsAllowed:async()=>{}}));
vi.mock("./user-blocks.js",()=>({assertConversationMessagingAllowed:async()=>{}}));
import {createMessage,emitConversationEvent} from "./messaging.js";
beforeEach(()=>{
 let row;
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
 const delivery={emit:vi.fn()},io={to:vi.fn(()=>delivery)};await emitConversationEvent(io,"CONV-WORLD","message:new",{});
 expect(io.to).toHaveBeenCalledTimes(1);expect(delivery.emit).toHaveBeenCalledOnce();
});
