import { expect, it, vi } from "vitest";
import { appendOutbox } from "./progression.js";
import { giftOutboxContext } from "./gift-outbox-context.js";
it("persists versioned gift artwork inside the transaction and captures the same payload", async () => {
  const events=[];
  const db={uploadAsset:{findMany:vi.fn().mockResolvedValue([{publicId:"AST-one",mediaVersion:"abc123",posterMediaVersion:"def456"}])},realtimeOutbox:{create:vi.fn(async({data})=>({id:"event",...data}))}};
  await giftOutboxContext.run(events,()=>appendOutbox(db,"audio-room:room","gift:received",{gift:{mediaUrl:"/api/uploads/AST-one/file?displaySig=s",posterUrl:"/api/uploads/AST-one/file?poster=1&displaySig=p"}}));
  const payload=db.realtimeOutbox.create.mock.calls[0][0].data.payload;
  expect(payload.data.gift.mediaVersion).toBe("abc123");expect(payload.data.gift.posterMediaVersion).toBe("def456");
  expect(payload.data.gift.mediaUrl).toContain("v=abc123");expect(payload.data.gift.posterUrl).toContain("v=def456");
  expect(events).toEqual([{id:"event",channel:"audio-room:room",event:"gift:received",payload}]);
});
