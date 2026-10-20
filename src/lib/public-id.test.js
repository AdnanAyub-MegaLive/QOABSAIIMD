import { describe, expect, it, vi } from "vitest";
import { generateNumericPublicId } from "./public-id";

describe("numeric public IDs", () => {
  it("keeps random six-digit IDs for rooms", async () => {
    const id = await generateNumericPublicId("ROOM", async () => false, {
      nextNumber: () => 123456,
    });

    expect(id).toBe("ROOM-123456");
  });
  it.each([["USR","2030140"],["TLN","2030141"],["AGN","10200"]])("uses atomic database allocation for %s", async (prefix, number) => {
    const db = { $queryRaw: vi.fn(async () => [{ number }]) };
    expect(await generateNumericPublicId(prefix, async () => false, { db })).toBe(`${prefix}-${number}`);
    expect(db.$queryRaw).toHaveBeenCalledOnce();
  });

  it("retries when a generated ID already exists", async () => {
    const nextNumber = vi.fn().mockReturnValueOnce(123456).mockReturnValueOnce(654321);
    const id = await generateNumericPublicId(
      "ROOM",
      async (candidate) => candidate === "ROOM-123456",
      { nextNumber },
    );

    expect(id).toBe("ROOM-654321");
    expect(nextNumber).toHaveBeenCalledTimes(2);
  });
});
