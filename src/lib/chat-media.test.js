import { beforeEach, expect, it, vi } from "vitest";
const { db } = vi.hoisted(() => ({ db: {} }));
vi.mock("./prisma.js", () => ({ prisma: db }));
import { assertChatMediaAccess, authorizeChatMediaRead, claimChatMedia, chatMediaDTO } from "./chat-media.js";
import { createMessage, serializeMessage, editMessage, deleteMessage } from "./messaging.js";
import { requireChatGiftTarget, writeChatGiftMessage } from "./chat-gifts.js";
import { giftOperation } from "./gift-operation.js";
vi.mock("./chat-word-policy.js", () => ({ assertChatWordsAllowed: async () => {} }));
const conversation = { id: "c", publicId: "CONV-test", kind: "GROUP" };
let row;
beforeEach(() => {
  row = { id: "media", conversationId: "c", uploaderId: "s", key: "private-chat/test.webp", ready: true, consumed: false, kind: "picture", width: 80, height: 60, mimeType: "image/webp", expiresAt: new Date(Date.now()+86400000) };
  let saved;
  Object.assign(db, {
    user: { findFirst: vi.fn(async () => ({ id: "s" })), findMany: vi.fn(async () => [{status:"ACTIVE",appRoles:[]},{status:"ACTIVE",appRoles:[]}]) },
    userBlock: { findFirst: vi.fn(async () => null) }, userFollow: { count: vi.fn(async () => 2) },
    conversation: { findUnique: vi.fn(async () => conversation), update: vi.fn() },
    conversationParticipant: { findUnique: vi.fn(async () => ({ id: "m" })), findFirst: vi.fn(async () => ({ conversation, conversationId:"c",userId:"r" })), findMany: vi.fn(async () => [{userId:"r"}]), update: vi.fn() },
    chatMediaObject: { findFirst: vi.fn(async () => row.consumed ? null : row), updateMany: vi.fn(async () => {row.consumed=true;return {count:1};}) },
    message: { findUnique: vi.fn(async () => saved), findFirst: vi.fn(async () => saved), create: vi.fn(async ({data}) => (saved={id:"msg",createdAt:new Date(),...data,sender:{publicId:"USR-s",name:"Sender"}})), update: vi.fn() },
    messageReceipt:{createMany:vi.fn()}, notification:{create:vi.fn()}, realtimeOutbox:{create:vi.fn()},
  });
  db.$transaction = fn => fn(db);
});
it("claims only the sender's ready upload scoped to the chat", async () => {
  expect(await claimChatMedia(db,"media",conversation,"s")).toMatchObject({kind:"picture",media:{mimeType:"image/webp"}});
  expect(db.chatMediaObject.findFirst).toHaveBeenCalledWith({where:expect.objectContaining({uploaderId:"s",conversationId:"c",ready:true,consumed:false})});
  await expect(claimChatMedia(db,"media",conversation,"s")).rejects.toMatchObject({code:"CHAT_MEDIA_UNAVAILABLE"});
});
it("sends attachment once and returns the original on retry", async () => {
  const options={mediaId:"media",clientMessageId:"photo-request"};
  const first=await createMessage(conversation,{id:"s",name:"Sender"},null,null,options);
  expect(first).toMatchObject({type:"picture",body:"Sent a photo",media:{width:80,height:60}});
  expect(await createMessage(conversation,{id:"s"},null,null,options)).toEqual(first);
  expect(db.message.create).toHaveBeenCalledTimes(1);
  expect(db.notification.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({body:"Photo"})}));
  await expect(createMessage(conversation,{id:"s"},null,null,{...options,mediaId:"different"})).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
});
it.each(["picture", "video"])("preserves %s captions and checks replay content", async (kind) => {
  row.kind = kind;
  const options = {mediaId:"media",clientMessageId:"caption-request"};
  const first = await createMessage(conversation,{id:"s",name:"Sender"},"  My caption  ",null,options);
  expect(first).toMatchObject({type:kind,body:"My caption"});
  expect(await createMessage(conversation,{id:"s"},"My caption",null,options)).toEqual(first);
  await expect(createMessage(conversation,{id:"s"},"Different caption",null,options)).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
});
it("keeps video fallback for an empty caption", async () => {
  row.kind = "video";
  expect(await createMessage(conversation,{id:"s"},"   ",null,{mediaId:"media",clientMessageId:"empty-video"})).toMatchObject({body:"Sent a video"});
});
it("rejects an oversized media caption before claiming the upload", async () => {
  await expect(createMessage(conversation,{id:"s"},"x".repeat(2001),null,{mediaId:"media",clientMessageId:"long-caption"})).rejects.toMatchObject({code:"VALIDATION_ERROR"});
  expect(db.chatMediaObject.updateMany).not.toHaveBeenCalled();
});
it("rejects World media and removed or banned senders",async()=>{
  await expect(assertChatMediaAccess(db,{...conversation,kind:"WORLD"},"s",true)).rejects.toMatchObject({code:"VALIDATION_ERROR"});
  db.conversationParticipant.findUnique.mockResolvedValueOnce(null);
  await expect(assertChatMediaAccess(db,conversation,"s",true)).rejects.toMatchObject({code:"CONVERSATION_NOT_FOUND"});
  db.user.findFirst.mockResolvedValueOnce(null);
  await expect(assertChatMediaAccess(db,conversation,"s",true)).rejects.toMatchObject({code:"USER_NOT_FOUND"});
});
it("checks mutual follows again and preserves both-direction blocks",async()=>{
  db.userFollow.count.mockResolvedValueOnce(1);
  await expect(assertChatMediaAccess(db,{...conversation,kind:"DIRECT"},"s",true)).rejects.toMatchObject({code:"MUTUAL_FOLLOW_REQUIRED"});
  db.userBlock.findFirst.mockResolvedValueOnce({blockerId:"r"});
  await expect(assertChatMediaAccess(db,conversation,"s",true)).rejects.toMatchObject({code:"USER_BLOCKED"});
});
it("never exposes private object keys and denies unpublished media to others",async()=>{
  expect(JSON.stringify(chatMediaDTO(row,"CONV-test"))).not.toContain("private-chat");
  await expect(authorizeChatMediaRead(db,row,conversation,"r")).rejects.toMatchObject({code:"MESSAGE_NOT_FOUND"});
  await expect(authorizeChatMediaRead(db,row,conversation,"s")).resolves.toBeUndefined();
  row.consumed=true;
  await expect(authorizeChatMediaRead(db,row,conversation,"s")).rejects.toMatchObject({code:"MESSAGE_NOT_FOUND"});
});
it("denies edited media and expired media deletion, but allows recent deletion",async()=>{
  db.message.findFirst.mockResolvedValue({id:"m",senderId:"s",kind:"picture",createdAt:new Date(Date.now()-900001)});
  await expect(editMessage("CONV-test","MSG-test","s","new")).rejects.toMatchObject({code:"MESSAGE_EDIT_FORBIDDEN"});
  await expect(deleteMessage("CONV-test","MSG-test","s")).rejects.toMatchObject({code:"MESSAGE_DELETE_WINDOW_EXPIRED"});
  db.message.findFirst.mockResolvedValue({id:"m",senderId:"s",kind:"picture",createdAt:new Date()});
  await deleteMessage("CONV-test","MSG-test","s"); expect(db.message.update).toHaveBeenCalledOnce();
  expect(serializeMessage({publicId:"m",kind:"picture",media:{url:"hidden"},createdAt:new Date(),deletedAt:new Date()})).toMatchObject({media:null,body:null});
});
it("chat gift target must be another member; World gifts are refused",async()=>{
  await expect(requireChatGiftTarget(db,"CONV-test","s","s")).rejects.toMatchObject({code:"RECIPIENT_UNAVAILABLE"});
  db.conversationParticipant.findUnique.mockResolvedValueOnce({}).mockResolvedValueOnce(null);
  await expect(requireChatGiftTarget(db,"CONV-test","s","r")).rejects.toMatchObject({code:"RECIPIENT_UNAVAILABLE"});
});
it("gift messages use the supplied transaction, receipt and outbox with full metadata",async()=>{
  const payload={gift:{id:"AST-g",name:"Rose",quantity:2,mimeType:"application/svga",posterUrl:"https://cdn.test/p.webp"},recipientId:"USR-r",transactionId:"g1"};
  const result=await writeChatGiftMessage(db,conversation,{id:"s"},"gift-request",payload);
  expect(result).toMatchObject({type:"gift",gift:payload,clientMessageId:"gift-request"});
  expect(db.realtimeOutbox.create).toHaveBeenCalledWith({data:expect.objectContaining({event:"message:new",channel:"conversation:CONV-test",payload:expect.objectContaining({message:result})})});
  await expect(writeChatGiftMessage(db,conversation,{id:"s"},"gift-request",payload)).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
});
it("gift request fingerprint includes conversation and message identity",()=>{
  const body={giftId:"AST-g",recipientId:"USR-r",conversationId:"CONV-1",clientMessageId:"msg-123456"};
  expect(giftOperation(body,"key-123456","PAID")).toEqual(giftOperation(body,"key-123456","PAID"));
  expect(giftOperation(body,"key-123456","PAID").fingerprint).not.toBe(giftOperation({...body,conversationId:"CONV-2"},"key-123456","PAID").fingerprint);
});
