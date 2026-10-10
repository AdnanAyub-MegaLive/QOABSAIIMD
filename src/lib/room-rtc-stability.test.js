import { expect, it, vi } from "vitest";
import { nextSeatStatus } from "./room-seat-status.js";
import { permissionTransitions } from "./rtc-permission-transitions.js";
import { createRoomJoinGuard } from "./room-join-guard.js";
import { createRtcTicketCache } from "./rtc-ticket-cache.js";
it("reuses valid identical tickets and renews near expiry",async()=>{
  const cache=createRtcTicketCache(),issue=vi.fn(async()=>({expiresAt:new Date(Date.now()+60000).toISOString()}));
  await cache("key",issue);await cache("key",issue);expect(issue).toHaveBeenCalledTimes(1);
  await cache("changed-permission",issue);expect(issue).toHaveBeenCalledTimes(2);
  const expiring=vi.fn(async()=>({expiresAt:new Date(Date.now()+1000).toISOString()}));
  await cache("expired",expiring);await cache("expired",expiring);expect(expiring).toHaveBeenCalledTimes(2);
});
it("speaking never unmutes or changes permission",()=>{
  expect(nextSeatStatus({isMuted:true,isForceMuted:false,isSpeaking:false},{speaking:true})).toMatchObject({isMuted:true,isSpeaking:false,permissionChanged:false,changed:false});
  expect(nextSeatStatus({isMuted:false,isForceMuted:false,isSpeaking:false},{speaking:true})).toMatchObject({isSpeaking:true,permissionChanged:false,changed:true});
});
it("force mute blocks activation and invalid booleans are rejected",()=>{
  expect(()=>nextSeatStatus({isMuted:true,isForceMuted:true},{muted:false})).toThrow("SEAT_FORCE_MUTED");
  expect(()=>nextSeatStatus({isMuted:true},{muted:"false"})).toThrow("VALIDATION_ERROR");
});
it("coalesces repeated permission mutations and preserves ordering",async()=>{
  const gate=permissionTransitions(),change=vi.fn(async()=>({updated:true}));
  await Promise.all([gate.run("one",true,change),gate.run("one",true,change)]);
  expect(change).toHaveBeenCalledTimes(1);
  await gate.run("one",false,change);expect(change).toHaveBeenCalledTimes(2);
});
it("failed media changes remain retryable and never report success",async()=>{
  const gate=permissionTransitions(),change=vi.fn().mockRejectedValueOnce(new Error("provider down")).mockResolvedValue({updated:true});
  await expect(gate.run("one",false,change)).rejects.toThrow("provider down");
  await expect(gate.run("one",false,change)).resolves.toEqual({updated:true});
  expect(change).toHaveBeenCalledTimes(2);
});
it("evaluates current permission inside the queue",async()=>{
  const gate=permissionTransitions(),change=vi.fn(async()=>({updated:true}));
  await gate.run("one",async()=>false,change);
  expect(change).toHaveBeenCalledWith(false);
});
it("duplicate in-flight joins run membership and entrance work only once",async()=>{
  const join=createRoomJoinGuard(),operation=vi.fn(async()=>({success:true})),first=vi.fn(),second=vi.fn();
  await Promise.all([join("room",operation,first),join("room",operation,second)]);
  expect(operation).toHaveBeenCalledTimes(1);
  expect(first).toHaveBeenCalledWith({success:true});expect(second).toHaveBeenCalledWith({success:true});
});
