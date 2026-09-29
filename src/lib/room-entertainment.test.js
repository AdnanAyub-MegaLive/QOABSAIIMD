import { describe, expect, it } from "vitest";
import { currentMusicPosition, nextRoomMusicState, normalizeEntertainmentUpdate } from "./room-entertainment";

describe("room entertainment", () => {
  it("never accepts a device-local music path or URL", () => {
    expect(normalizeEntertainmentUpdate({ kind: "music", state: { status: "playing", positionMs: 12.8, localUri: "file:///secret.mp3", trackUrl: "https://example.test/song.mp3" } })).toEqual({ kind: "music", state: { status: "PLAYING", positionMs: 12 } });
  });

  it("supports clearing one state", () => {
    expect(normalizeEntertainmentUpdate({ kind: "watch", state: null })).toEqual({ kind: "watch", state: null });
  });

  it("creates metadata-only playing state and computes elapsed position", () => {
    const started = new Date("2026-09-29T10:00:00.000Z");
    const music = nextRoomMusicState("PLAY", { title: "Local song", artist: "Artist", localTrackId: "phone-track-1", durationSeconds: 120, positionSeconds: 10, localUri: "file:///hidden.mp3" }, null, started, "MUSIC-USR-1");
    expect(music).toEqual({ localTrackId: "phone-track-1", title: "Local song", artist: "Artist", durationSeconds: 120, status: "PLAYING", positionSeconds: 10, startedAt: started.toISOString(), publisherId: "MUSIC-USR-1" });
    expect(currentMusicPosition(music, new Date("2026-09-29T10:00:05.000Z"))).toBe(15);
  });

  it("freezes playback position when paused", () => {
    const current = { title: "Song", durationSeconds: 120, status: "PLAYING", positionSeconds: 10, startedAt: "2026-09-29T10:00:00.000Z" };
    expect(nextRoomMusicState("PAUSE", {}, current, new Date("2026-09-29T10:00:05.000Z"), "MUSIC-USR-1")).toMatchObject({ status: "PAUSED", positionSeconds: 15, startedAt: null });
  });
});
