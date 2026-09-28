import { describe, expect, it } from "vitest";
import { pkWinner } from "./live-maintenance";

describe("live maintenance policy", () => {
  it("selects either PK side and preserves a draw", () => {
    expect(pkWinner(10n, 5n, "LEFT", "RIGHT")).toBe("LEFT");
    expect(pkWinner(5n, 10n, "LEFT", "RIGHT")).toBe("RIGHT");
    expect(pkWinner(10n, 10n, "LEFT", "RIGHT")).toBeNull();
  });
});
