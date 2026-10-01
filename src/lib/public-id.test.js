import { describe, expect, it, vi } from "vitest";
import { generateNumericPublicId } from "./public-id";

describe("numeric public IDs", () => {
  it("creates the requested prefix with exactly six digits", async () => {
    const id = await generateNumericPublicId("USR", async () => false, {
      nextNumber: () => 123456,
    });

    expect(id).toBe("USR-123456");
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
