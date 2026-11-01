import { expect, it, vi } from "vitest";
import { giftOutboxContext, giftTransactionRead } from "./gift-outbox-context.js";
it("shares immutable reads only inside the same transaction attempt", async () => {
  const read = vi.fn(async () => ({ version: read.mock.calls.length }));
  await giftOutboxContext.run([], async () => {
    const tx = {};
    const values = await Promise.all([giftTransactionRead(tx, "policy", read), giftTransactionRead(tx, "policy", read)]);
    expect(values[0]).toBe(values[1]);
    expect(read).toHaveBeenCalledTimes(1);
    await giftTransactionRead({}, "policy", read);
    expect(read).toHaveBeenCalledTimes(2);
  });
  await giftOutboxContext.run([], () => giftTransactionRead({}, "policy", read));
  expect(read).toHaveBeenCalledTimes(3);
});
it("does not cache reads outside gift operations", async () => {
  const read = vi.fn(async () => 1), tx = {};
  await giftTransactionRead(tx, "policy", read);
  await giftTransactionRead(tx, "policy", read);
  expect(read).toHaveBeenCalledTimes(2);
});
