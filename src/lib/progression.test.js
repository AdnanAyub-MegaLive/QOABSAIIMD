import { expect, it } from "vitest";
import { levelSnapshot, validateProgressionConfig } from "./progression.js";
import { giftOperation, priorGiftOperation } from "./gift-operation.js";
const levels=[0n,100n,500n].map((thresholdPoints,level)=>({track:"USER",level,thresholdPoints,benefits:[]}));
it("computes exact boundaries and maximum without floating-point amount conversion",()=>{
  const snapshot=points=>levelSnapshot({track:"USER",configurationVersion:1,revision:1,lifetimePoints:points},levels,null);
  expect(snapshot(99n)).toMatchObject({level:0,remainingPoints:"1",progressPercent:99});
  expect(snapshot(100n)).toMatchObject({level:1,remainingPoints:"400",progressPercent:0});
  expect(snapshot(101n)).toMatchObject({level:1,progressPercent:0.25});
  expect(snapshot(9007199254740993n)).toMatchObject({level:2,nextLevel:null,remainingPoints:"0",progressPercent:100,lifetimePoints:"9007199254740993"});
});
it("rejects unapproved, duplicate or non-increasing rules",()=>{
  const input={enabled:false,rules:[],levels:[{track:"USER",level:0,thresholdPoints:"0",benefits:[]},{track:"CHARM",level:0,thresholdPoints:"0",benefits:[]}]};
  expect(validateProgressionConfig(input).enabled).toBe(false);
  expect(()=>validateProgressionConfig({...input,enabled:true})).toThrow();
  expect(()=>validateProgressionConfig({...input,levels:[...input.levels,{track:"USER",level:1,thresholdPoints:"0",benefits:[]}]})).toThrow();
});
it("fingerprints recipient sets and rejects conflicting retries",async()=>{
  const key="request-123",a=giftOperation({giftId:"AST-1",recipientIds:["B","A"]},key,"MULTI"),b=giftOperation({giftId:"AST-1",recipientIds:["A","B"]},key,"MULTI");
  expect(a).toEqual(b);
  const db={giftRequest:{findUnique:async()=>({fingerprint:a.fingerprint,result:{ok:true}})}};
  expect(await priorGiftOperation("u",b,db)).toEqual({ok:true});
  await expect(priorGiftOperation("u",giftOperation({giftId:"AST-2"},key,"MULTI"),db)).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
});
