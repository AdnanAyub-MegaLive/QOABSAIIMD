import { describe, expect, it } from "vitest";
import { csRoomMessageWhere } from "./cs-room-history.js";

describe("csRoomMessageWhere", () => {
  it("returns an empty filter for all countries without search", () => expect(csRoomMessageWhere()).toEqual({}));
  it("filters by country and searches body, id and sender", () => {
    const where = csRoomMessageWhere({ country: "PK", query: " ali " });
    expect(where.country).toBe("PK");
    expect(where.OR).toHaveLength(4);
    expect(where.OR[2]).toEqual({ sender: { is: { name: { contains: "ali", mode: "insensitive" } } } });
  });
});
