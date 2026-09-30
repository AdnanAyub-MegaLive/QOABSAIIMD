import { describe, expect, it } from "vitest";
import { catalogTrackWhere, validateRoomMusicUpload } from "./music-catalog";

describe("room-private music catalog", () => {
  it("resolves only global tracks or tracks belonging to the requested room", () => {
    expect(catalogTrackWhere("AST-1", "room-internal-a")).toMatchObject({
      publicId: "AST-1",
      category: "MUSIC_TRACKS",
      active: true,
      OR: [{ isGlobal: true, audioRoomId: null }, { audioRoomId: "room-internal-a", isGlobal: false }],
    });
  });

  it("does not expose private tracks when no room scope is supplied", () => {
    expect(catalogTrackWhere("AST-1").OR).toEqual([{ isGlobal: true, audioRoomId: null }]);
  });

  it("enforces decoded MIME, size and duration limits", () => {
    expect(validateRoomMusicUpload({ size: 1024, declaredMimeType: "audio/mpeg", detectedMimeType: "audio/mpeg", durationSeconds: "120" })).toEqual({ mimeType: "audio/mpeg", durationSeconds: 120 });
    expect(() => validateRoomMusicUpload({ size: 1024, declaredMimeType: "audio/mpeg", detectedMimeType: "video/mp4" })).toThrow("MP3");
    expect(() => validateRoomMusicUpload({ size: 21 * 1024 * 1024, declaredMimeType: "audio/mpeg", detectedMimeType: "audio/mpeg" })).toThrow("20 MB");
    expect(() => validateRoomMusicUpload({ size: 1024, declaredMimeType: "audio/mpeg", detectedMimeType: "audio/mpeg", durationSeconds: 901 })).toThrow("15 minutes");
  });
});
