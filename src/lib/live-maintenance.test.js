import { describe, expect, it } from "vitest";
import { pkWinner, socketUserCounts } from "./live-maintenance";

describe("live maintenance policy", () => {
  it("selects either PK side and preserves a draw", () => {
    expect(pkWinner(10n, 5n, "LEFT", "RIGHT")).toBe("LEFT");
    expect(pkWinner(5n, 10n, "LEFT", "RIGHT")).toBe("RIGHT");
    expect(pkWinner(10n, 10n, "LEFT", "RIGHT")).toBeNull();
  });

  it("counts unique audio-room users across multiple sockets", () => {
    const counts = socketUserCounts([{ data: { userId: "USR-1" } }, { data: { userId: "USR-1" } }, { data: { userId: "USR-2" } }, { data: {} }]);
    expect([...counts]).toEqual([["USR-1", 2], ["USR-2", 1]]);
  });
});
