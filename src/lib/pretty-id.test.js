import { expect, it } from "vitest";
import { fitsPattern } from "./pretty-id.js";

it("preserves leading zeroes and checks the pattern rather than just the length", () => {
  expect(fitsPattern("AABBBBB","0011111")).toBe(true);
  expect(fitsPattern("ABABABA","1212121")).toBe(true);
  for (const code of ["1111111","1101000","110000","11AAAAA",1100000])
    expect(fitsPattern("AABBBBB",code)).toBe(false);
});
