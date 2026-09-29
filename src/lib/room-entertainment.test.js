import { describe, expect, it } from "vitest";
import { currentMusicPosition, nextRoomMusicState, normalizeEntertainmentUpdate } from "./room-entertainment";

describe("room entertainment", () => {
  it("never accepts a device-local music path or URL", () => {
    expect(normalizeEntertainmentUpdate({ kind: "music", state: { status: "playing", positionMs: 12.8, localUri: "file:///secret.mp3", trackUrl: "https://example.test/song.mp3", source: "CATALOG", catalogTrackId: "AST-FAKE" } })).toEqual({ kind: "music", state: { status: "PLAYING", positionMs: 12, source: "LOCAL" } });
  });

  it("supports clearing one state", () => {
    expect(normalizeEntertainmentUpdate({ kind: "watch", state: null })).toEqual({ kind: "watch", state: null });
  });

  it("creates metadata-only playing state and computes elapsed position", () => {
    const started = new Date("2026-09-29T10:00:00.000Z");
    const music = nextRoomMusicState("PLAY", { title: "Local song", artist: "Artist", localTrackId: "phone-track-1", durationSeconds: 120, positionSeconds: 10, localUri: "file:///hidden.mp3" }, null, started, "MUSIC-USR-1");
    expect(music).toEqual({ source: "LOCAL", catalogTrackId: null, localTrackId: "phone-track-1", title: "Local song", artist: "Artist", mimeType: null, trackUrl: null, durationSeconds: 120, status: "PLAYING", positionSeconds: 10, startedAt: started.toISOString(), publisherId: "MUSIC-USR-1" });
    expect(currentMusicPosition(music, new Date("2026-09-29T10:00:05.000Z"))).toBe(15);
  });

  it("freezes playback position when paused", () => {
    const current = { title: "Song", durationSeconds: 120, status: "PLAYING", positionSeconds: 10, startedAt: "2026-09-29T10:00:00.000Z" };
    expect(nextRoomMusicState("PAUSE", {}, current, new Date("2026-09-29T10:00:05.000Z"), "MUSIC-USR-1")).toMatchObject({ status: "PAUSED", positionSeconds: 15, startedAt: null });
  });

  it("uses only the server-resolved catalog track URL", () => {
    const track = { id: "AST-TRACK", title: "Trusted title", artist: "Trusted artist", mimeType: "audio/mpeg", trackUrl: "https://portal.test/signed-track" };
    const music = nextRoomMusicState("PLAY", { source: "CATALOG", catalogTrackId: "AST-TRACK", title: "Injected", trackUrl: "https://evil.test/audio" }, null, new Date("2026-09-29T10:00:00.000Z"), "MUSIC-USR-1", track);
    expect(music).toMatchObject({ source: "CATALOG", catalogTrackId: "AST-TRACK", title: "Trusted title", artist: "Trusted artist", mimeType: "audio/mpeg", trackUrl: "https://portal.test/signed-track" });
  });
});
