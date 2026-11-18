import { describe, it, expect, vi } from "vitest";
import { addCombinationIds, parseCombinationCodes, prettyCombinationInput, syncCombinationIds } from "./pretty-id-store.js";

const combination = { id: "combo-1", pattern: "AABBCCD", coinPrice: 4000000n, durationDays: 30, storeVisible: true, active: true };

function fixture({ reserved = [], defined = [], occupied = [] } = {}) {
  const upserts = [];
  const tx = {
    publicNumberReservation: { findMany: vi.fn(async () => reserved.map(number => ({ number }))) },
    specialIdDefinition: { findMany: vi.fn(async () => defined), upsert: vi.fn(async args => upserts.push(args)), updateMany: vi.fn(async () => ({ count: 1 })) },
    specialIdAssignment: { findMany: vi.fn(async () => occupied.map(specialId => ({ specialId }))) },
  };
  return { tx, upserts };
}

describe("ID combinations", () => {
  it("validates combination input", () => {
    expect(prettyCombinationInput({ pattern: "aabbccd", price: "4000000", durationDays: 30, visible: true })).toMatchObject({ pattern: "AABBCCD", coinPrice: 4000000n });
    expect(() => prettyCombinationInput({ pattern: "AB1", price: "1", durationDays: 30, visible: true })).toThrow();
    expect(() => prettyCombinationInput({ pattern: "AAB", price: "0", durationDays: 30, visible: true })).toThrow();
  });
  it("splits codes and rejects ones that do not fit the pattern", () => {
    expect(parseCombinationCodes("AABBCCD", "1122334, 1212334\n1122334")).toEqual({ codes: ["1122334"], wrong: ["1212334"] });
    expect(parseCombinationCodes("ABAB", "1212 ABAB 1111")).toEqual({ codes: ["1212", "ABAB"], wrong: ["1111"] });
  });
  it("creates store Special IDs with the combination price and skips taken codes", async () => {
    const { tx, upserts } = fixture({ defined: [{ code: "3344556", active: true }], occupied: ["5566778"] });
    const result = await addCombinationIds(tx, combination, "1122334 3344556 5566778 1212334");
    expect(result).toEqual({ added: ["1122334"], wrong: ["1212334"], taken: ["3344556", "5566778"] });
    expect(upserts[0]).toMatchObject({ where: { code: "1122334" }, create: { code: "1122334", coinPrice: 4000000n, storeVisible: true, defaultDurationMinutes: 43200, combinationId: "combo-1", category: "STANDARD" } });
  });
  it("hides a removed combination's IDs from the Mall", async () => {
    const { tx } = fixture();
    await syncCombinationIds(tx, { ...combination, active: false });
    expect(tx.specialIdDefinition.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ storeVisible: false }) }));
  });
});
