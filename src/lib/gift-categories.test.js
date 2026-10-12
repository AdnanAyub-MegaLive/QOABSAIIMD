import { expect, it } from "vitest";
import { GIFT_CATEGORIES, giftCategory } from "./gift-categories";
it("defines the six app categories and retains legacy gift behavior independently",()=>{
  expect(GIFT_CATEGORIES.map(([id])=>id)).toEqual(["NORMAL","LUCKY","VIP","CP_GIFT","COUNTRY","CUSTOMIZED"]);
  expect(giftCategory(null,"PREMIUM")).toBe("NORMAL");
  expect(giftCategory(null,"BLIND_BOX")).toBe("CUSTOMIZED");
  expect(giftCategory("COUNTRY","CLASSIC")).toBe("COUNTRY");
  expect(()=>giftCategory("INVALID","CLASSIC")).toThrow();
});
