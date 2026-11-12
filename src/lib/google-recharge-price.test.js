import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { googleRechargeProductDto, parseGooglePriceUsd } from "./google-recharge-price.js";

describe("Google recharge display price", () => {
  it.each([["", null], ["  ", null], ["4.99", "4.99"], ["5", "5.00"], ["0.5", "0.50"], ["99999999.99", "99999999.99"]])("accepts %s", (input, expected) => {
    expect(parseGooglePriceUsd(input)).toBe(expected);
  });
  it.each(["-1", "4.999", "100000000", "1e3", "NaN", "$4.99", "1,000.00"])("rejects invalid price %s", input => {
    expect(() => parseGooglePriceUsd(input)).toThrow();
  });
  it("serializes exact Decimal prices with two decimals and keeps unset prices null", () => {
    const product = { productId: "payment_07", coins: 42000n };
    expect(googleRechargeProductDto({ ...product, priceUsd: new Prisma.Decimal("4.9") })).toEqual({ productId: "payment_07", coins: "42000", priceUsd: "4.90" });
    expect(googleRechargeProductDto({ ...product, priceUsd: null }).priceUsd).toBeNull();
    expect(googleRechargeProductDto({ ...product, priceUsd: new Prisma.Decimal(0) }).priceUsd).toBe("0.00");
  });
});
