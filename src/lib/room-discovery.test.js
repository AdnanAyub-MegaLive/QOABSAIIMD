import { describe, expect, it } from "vitest";
import { countryVariants, discoverableRoomWhere, liveCountryCounts } from "./room-discovery.js";

describe("room discovery countries", () => {
  it("merges names and codes into one country and sorts by rooms", () => {
    const rows = [
      { country: "PK", _count: { _all: 2 } },
      { country: "Pakistan", _count: { _all: 1 } },
      { country: "ng", _count: { _all: 4 } },
      { country: "nowhere-land", _count: { _all: 9 } },
    ];
    expect(liveCountryCounts(rows)).toEqual([{ code: "NG", liveRooms: 4 }, { code: "PK", liveRooms: 3 }]);
  });
  it("finds every stored spelling of a country", () => {
    expect(countryVariants("PK", ["PK", "Pakistan", "IN", null]).sort()).toEqual(["PK", "Pakistan"]);
  });
  it("hides the viewer's own and invisible rooms", () => {
    const where = discoverableRoomWhere("u1");
    expect(where.ownerId).toEqual({ not: "u1" });
    expect(where.privacyMode).toEqual({ not: "HIDDEN" });
    expect(where.status).toBe("LIVE");
  });
});
