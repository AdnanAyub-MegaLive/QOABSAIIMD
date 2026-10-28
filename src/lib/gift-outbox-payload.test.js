import { expect, it, vi } from "vitest";
import { appendOutbox } from "./progression.js";
import { giftOutboxContext } from "./gift-outbox-context.js";
it("stores combo timing durably for both gift event types, not unrelated events", async () => {
  const events = [];
  events.comboTiming = { id: "scope", expiresAt: "2026-10-28T12:00:03.000Z" };
  const db = { uploadAsset: { findMany: vi.fn().mockResolvedValue([]) }, realtimeOutbox: { create: vi.fn(async ({ data }) => ({ id: data.event, ...data })) } };
  for (const event of ["gift:received", "gift:received-multi", "audio-room:pk-score"]) {
    await giftOutboxContext.run(events, () => appendOutbox(db, "audio-room:room", event, { quantity: 50 }));
  }
  const rows = db.realtimeOutbox.create.mock.calls.map(([arg]) => arg.data);
  expect(rows[0].payload.data.comboTiming).toEqual(events.comboTiming);
  expect(rows[1].payload.data.comboTiming).toEqual(events.comboTiming);
  expect(rows[2].payload.data).not.toHaveProperty("comboTiming");
  expect(events).toHaveLength(2);
});
it("persists versioned gift artwork inside the transaction and captures the same payload", async () => {
  const events=[];
  const db={uploadAsset:{findMany:vi.fn().mockResolvedValue([{publicId:"AST-one",mediaVersion:"abc123",posterMediaVersion:"def456"}])},realtimeOutbox:{create:vi.fn(async({data})=>({id:"event",...data}))}};
  await giftOutboxContext.run(events,()=>appendOutbox(db,"audio-room:room","gift:received",{gift:{mediaUrl:"/api/uploads/AST-one/file?displaySig=s",posterUrl:"/api/uploads/AST-one/file?poster=1&displaySig=p"}}));
  const payload=db.realtimeOutbox.create.mock.calls[0][0].data.payload;
  expect(payload.data.gift.mediaVersion).toBe("abc123");expect(payload.data.gift.posterMediaVersion).toBe("def456");
  expect(payload.data.gift.mediaUrl).toContain("v=abc123");expect(payload.data.gift.posterUrl).toContain("v=def456");
  expect(events).toEqual([{id:"event",channel:"audio-room:room",event:"gift:received",payload}]);
});
it("reuses shared artwork versions only within one gift transaction attempt", async () => {
  const db = { uploadAsset: { findMany: vi.fn().mockResolvedValue([{publicId:"AST-shared",mediaVersion:"v1"}]) },
    realtimeOutbox: { create: vi.fn(async ({data}) => ({id:String(Math.random()),...data})) } };
  const gift={mediaUrl:"/api/uploads/AST-shared/file"};
  await giftOutboxContext.run([],async()=>{
    for(const recipientId of ["a","b","c","d"]) await appendOutbox(db,"audio-room:r","gift:received",{recipientId,gift});
  });
  expect(db.uploadAsset.findMany).toHaveBeenCalledTimes(1);
  expect(db.realtimeOutbox.create).toHaveBeenCalledTimes(4);
  for(const [arg] of db.realtimeOutbox.create.mock.calls) expect(arg.data.payload.data.gift.mediaUrl).toContain("v=v1");
  db.uploadAsset.findMany.mockResolvedValue([{publicId:"AST-shared",mediaVersion:"v2"}]);
  await giftOutboxContext.run([],()=>appendOutbox(db,"audio-room:r","gift:received",{gift}));
  expect(db.uploadAsset.findMany).toHaveBeenCalledTimes(2);
  expect(db.realtimeOutbox.create.mock.calls.at(-1)[0].data.payload.data.gift.mediaUrl).toContain("v=v2");
});
