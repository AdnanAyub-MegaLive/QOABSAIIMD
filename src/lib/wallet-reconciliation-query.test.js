import { expect, it, vi } from "vitest";
import { readWalletReconciliation } from "./wallet-reconciliation.js";
it("uses one full-history snapshot without UI limits and preserves exact values", async () => {
  const db = {$queryRaw:vi.fn(async()=>[{publicId:"U",name:"Test",coinBalance:9007199254740993n,resellerCoinBalance:50n,hostSalaryCoinBalance:2n,ledgerCoins:"9007199254740993",ledgerBusinessCoins:"50",ledgerSalaryCoins:"2"}])};
  expect(await readWalletReconciliation(db)).toEqual([expect.objectContaining({status:"MATCHED",balanceCoins:"9007199254740993",ledgerBusinessCoins:"50"})]);
  expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  const sql=db.$queryRaw.mock.calls[0][0].join("");
  expect(sql).not.toMatch(/LIMIT|OFFSET/i);
  expect(sql).toContain("'BUSINESS'");
  expect(sql).toContain("'COMPLETED', 'PENDING'");
});
