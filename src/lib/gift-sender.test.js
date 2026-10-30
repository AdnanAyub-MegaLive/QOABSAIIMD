import { describe, expect, it } from "vitest";
import { giftSenderPayload, settledGiftSender } from "./gift-sender";

describe("gift sender payload", () => {
  it("includes equipped room-chat decorations and progression defaults", () => {
    expect(giftSenderPayload(
      { publicId: "USR-1", name: "Sender", profileImage: "https://example.test/avatar.webp", vipLevel: 3 },
      { frameUrl: "frame", badgeUrl: "badge", chatBoxUrl: "chat-box" },
    )).toEqual({
      id: "USR-1",
      publicId: "USR-1",
      name: "Sender",
      profileImage: "https://example.test/avatar.webp",
      frameUrl: "frame",
      badgeUrl: "badge",
      chatBoxUrl: "chat-box",
      level: 0,
      vipLevel: 3,
      anchorLevel: 0,
    });
  });
});

import { giftOutboxContext, rememberGiftProgress } from './gift-outbox-context.js';
it('uses both settled tracks for self-gifts without leaking snapshots between attempts', () => {
 const tx={}, retry={}, sender={id:'USR-1',level:1,charmLevel:2,frameUrl:'frame'};
 giftOutboxContext.run([],()=>{
  rememberGiftProgress(tx,'USR-1','USER',{level:3,badgeUrl:'wealth',background:{url:'bg',mimeType:'image/png',mediaVersion:'v2'}});
  expect(settledGiftSender(sender,tx)).toMatchObject({level:3,userLevel:3,charmLevel:2,frameUrl:'frame',userLevelBackgroundUrl:'bg',userLevelBackgroundMediaVersion:'v2'});
  rememberGiftProgress(tx,'USR-1','CHARM',{level:4,badgeUrl:'charm',background:null});
  expect(settledGiftSender(sender,tx)).toMatchObject({level:3,charmLevel:4,anchorLevel:4,charmLevelBadgeUrl:'charm',charmLevelBackgroundUrl:null});
  expect(settledGiftSender(sender,retry)).toEqual(sender);
 });
 expect(settledGiftSender(sender,tx)).toEqual(sender);
});
