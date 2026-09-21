import { describe, expect, it, vi } from "vitest";
import {
  createAudioRoomReaction,
  createAudioRoomReactionGuard,
  parseAudioRoomReactionInput,
} from "./audio-room-reactions";

describe("audio room reactions", () => {
  it("accepts exactly the gif_0 through gif_21 catalogue", () => {
    for (let index = 0; index <= 21; index += 1) {
      expect(parseAudioRoomReactionInput({
        roomId: "ROOM-123",
        reactionId: `gif_${index}`,
        requestId: `request-${index}`,
      }).reactionId).toBe(`gif_${index}`);
    }
    for (const reactionId of ["gif_-1", "gif_22", "GIF_1", "vip_1", "gif_01"]) {
      expect(() => parseAudioRoomReactionInput({
        roomId: "ROOM-123",
        reactionId,
        requestId: "request-invalid",
      })).toThrow("REACTION_NOT_ALLOWED");
    }
  });

  it("creates one shared server dice result and no expiry field", () => {
    const reaction = createAudioRoomReaction({
      roomId: "ROOM-123",
      senderId: "USR-123",
      seatId: "row0-seat1",
      reactionId: "gif_0",
      requestId: "request-dice",
      now: new Date("2026-09-21T12:00:00.000Z"),
      nextDiceValue: () => 4,
      nextEventId: () => "REACTION-125",
    });
    expect(reaction).toEqual({
      eventId: "REACTION-125",
      requestId: "request-dice",
      roomId: "ROOM-123",
      senderId: "USR-123",
      seatId: "row0-seat1",
      reactionId: "gif_0",
      kind: "DICE",
      diceValue: 4,
      createdAt: "2026-09-21T12:00:00.000Z",
    });
    expect(reaction).not.toHaveProperty("expiresAt");
  });

  it("deduplicates concurrent retries without running the operation twice", async () => {
    let resolveOperation;
    const operation = vi.fn(() => new Promise((resolve) => { resolveOperation = resolve; }));
    const guard = createAudioRoomReactionGuard();
    const first = guard.runOnce("USR-1:ROOM-1:req-12345", operation);
    const retry = guard.runOnce("USR-1:ROOM-1:req-12345", operation);
    await Promise.resolve();
    resolveOperation({ eventId: "REACTION-1" });
    expect(await first).toEqual({ duplicate: false, value: { eventId: "REACTION-1" } });
    expect(await retry).toEqual({ duplicate: true, value: { eventId: "REACTION-1" } });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("allows a burst of three and refills one reaction per second", () => {
    let time = 1_000;
    const guard = createAudioRoomReactionGuard({ now: () => time });
    expect(guard.consumeRateLimit("USR-1:ROOM-1")).toBe(true);
    expect(guard.consumeRateLimit("USR-1:ROOM-1")).toBe(true);
    expect(guard.consumeRateLimit("USR-1:ROOM-1")).toBe(true);
    expect(guard.consumeRateLimit("USR-1:ROOM-1")).toBe(false);
    time += 1_000;
    expect(guard.consumeRateLimit("USR-1:ROOM-1")).toBe(true);
    expect(guard.consumeRateLimit("USR-1:ROOM-1")).toBe(false);
  });
});
