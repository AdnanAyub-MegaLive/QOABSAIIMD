import { it, expect } from "vitest";
import { roomCoverDto } from "./room-cover.js";
it("uses one cache version independent of viewer or other room revisions", () => {
  const room = { roomId: "ROOM-1", coverImageUrl: "/api/audio-rooms/ROOM-1/cover", coverRevision: 7, revision: 400 };
  expect(roomCoverDto(room,"https://portal.example")).toEqual({coverImageUrl:"https://portal.example/api/audio-rooms/ROOM-1/cover?v=7",coverRevision:7});
  expect(roomCoverDto({...room,revision:500},"https://portal.example")).toEqual(roomCoverDto(room,"https://portal.example"));
  expect(roomCoverDto({...room,coverRevision:8},"https://portal.example").coverImageUrl).toContain("v=8");
});
it("handles empty covers and does not mutate external signed URLs", () => {
  expect(roomCoverDto({},"https://portal.example")).toEqual({coverImageUrl:null,coverRevision:0});
  expect(roomCoverDto({coverImageUrl:"https://cdn.example/a?sig=test",coverRevision:2},"https://portal.example").coverImageUrl).toBe("https://cdn.example/a?sig=test");
});
