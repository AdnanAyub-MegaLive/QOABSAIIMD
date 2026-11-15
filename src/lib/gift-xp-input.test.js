import { expect, it } from "vitest";
import { giftXpInput, receiverDiamondsInput } from "./gift-xp-input.js";
it("requires explicit sender and receiver XP",()=>{
  for(const value of [undefined,null,"", " ", -1, "1.5", "1e3", true, "1000000000001"]){
    expect(()=>giftXpInput({senderXp:value,receiverXp:"1"})).toThrow();
    expect(()=>giftXpInput({senderXp:"1",receiverXp:value})).toThrow();
  }
});
it("accepts explicit zero and whole XP amounts",()=>{
  expect(giftXpInput({senderXp:"100000",receiverXp:"50000"})).toEqual({senderXp:100000n,receiverXp:50000n});
  expect(giftXpInput({senderXp:"0",receiverXp:0})).toEqual({senderXp:0n,receiverXp:0n});
});

it("validates receiver Diamonds without confusing zero and default",()=>{
 expect(receiverDiamondsInput("")).toBe(null);
 expect(receiverDiamondsInput(undefined)).toBe(null);
 expect(receiverDiamondsInput("0")).toBe(0n);
 expect(receiverDiamondsInput("20")).toBe(20n);
 for(const v of [true," ","1.5","1e3",-1,"1000000000001"])expect(()=>receiverDiamondsInput(v)).toThrow();
});
