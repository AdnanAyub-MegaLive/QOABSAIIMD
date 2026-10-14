import { expect, it, vi } from "vitest";
import { notifyAction, welcomeNotification, dispatchNotifications, notificationDto } from "./action-notifications.js";
import { inboxWhere, notificationPage } from "./notification-inbox.js";
it("uses recipient-scoped stable keys and never emits inside the action transaction", async () => {
  const upsert = vi.fn(async () => ({}));
  const tx = { notification: { upsert } };
  const input = { userId: "u", key: "exchange:1", type: "EXCHANGE", title: "Done", body: "1 Coin received" };
  await notifyAction(tx,input); await notifyAction(tx,input);
  expect(upsert.mock.calls.map(([arg]) => arg.where.sourceKey)).toEqual(["u:exchange:1","u:exchange:1"]);
  expect(upsert.mock.calls[0][0].update).toEqual({});
});
it("uses admin welcome copy only for a single welcome key", async () => {
  const tx = { notificationSettings: { findUnique: async () => ({welcomeEnabled:true,welcomeTitle:"Hello",welcomeBody:"Welcome!"}) }, notification: { upsert: vi.fn() } };
  await welcomeNotification(tx,{id:"u"});
  expect(tx.notification.upsert).toHaveBeenCalledWith(expect.objectContaining({create:expect.objectContaining({title:"Hello",body:"Welcome!",sourceKey:"u:welcome"})}));
});
it("respects disabled welcome", async () => {
  const tx = { notificationSettings: { findUnique: async () => ({welcomeEnabled:false}) }, notification: { upsert: vi.fn() } };
  await welcomeNotification(tx,{id:"u"});expect(tx.notification.upsert).not.toHaveBeenCalled();
});
it("dispatches to current identity and keeps a stable public notification ID", async () => {
  const row = {id:"n",publicId:"NOT-1",userId:"u",user:{publicId:"TLN-1",status:"ACTIVE"},type:"WELCOME",title:"Hello",body:"Welcome",createdAt:new Date()};
  const emit=vi.fn(),io={to:vi.fn(()=>({emit}))};
  const db={notification:{findMany:async()=>[row],update:vi.fn()}};
  await dispatchNotifications(db,io);
  expect(io.to).toHaveBeenCalledWith("user:TLN-1");
  expect(emit).toHaveBeenCalledWith("notification:new",expect.objectContaining({id:"NOT-1"}));
  expect(db.notification.update).toHaveBeenCalled();
});
it("leaves failed socket delivery pending for retry", async () => {
  const db={notification:{findMany:async()=>[{id:"n",publicId:"NOT-1",userId:null,createdAt:new Date()}],update:vi.fn()}};
  await expect(dispatchNotifications(db,{emit:()=>{throw new Error("unavailable")}})).rejects.toThrow();
  expect(db.notification.update).not.toHaveBeenCalled();
});
it("does not expose internal recipient or source keys", () => {
  const dto=notificationDto({publicId:"NOT-1",userId:"private",sourceKey:"private:key",createdAt:new Date()});
  expect(dto).not.toHaveProperty("userId");expect(dto).not.toHaveProperty("sourceKey");
});
it("scopes inbox visibility and validates pagination", () => {
  expect(inboxWhere("u")).toEqual({OR:[{userId:null},{userId:"u"}]});
  expect(notificationPage(new URL("https://example.com")).limit).toBe(50);
  for(const query of ["limit=0","limit=1.5","limit=101","cursor=garbage"])expect(()=>notificationPage(new URL(`https://example.com?${query}`))).toThrow();
});
