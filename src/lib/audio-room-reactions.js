import { randomInt, randomUUID } from "node:crypto";

const REACTION_IDS = new Set(Array.from({ length: 22 }, (_, index) => `gif_${index}`));
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export const audioRoomReactionErrors = {
  REACTION_SEAT_REQUIRED: "You must occupy a room seat before sending an expression.",
  REACTION_NOT_ALLOWED: "This room expression is not allowed.",
  REACTION_RATE_LIMITED: "You are sending room expressions too quickly.",
};

export function reactionErrorPayload(code) {
  return {
    success: false,
    error: {
      code,
      message: audioRoomReactionErrors[code] ?? "Unable to send this room expression.",
    },
  };
}

export function parseAudioRoomReactionInput(input = {}) {
  const roomId = String(input.roomId ?? "").trim();
  const reactionId = String(input.reactionId ?? "").trim();
  const requestId = String(input.requestId ?? "").trim();
  if (
    !roomId ||
    roomId.length > 120 ||
    !REACTION_IDS.has(reactionId) ||
    !REQUEST_ID_PATTERN.test(requestId)
  ) {
    const error = new Error("REACTION_NOT_ALLOWED");
    error.code = "REACTION_NOT_ALLOWED";
    throw error;
  }
  return { roomId, reactionId, requestId };
}

export function createAudioRoomReaction({
  roomId,
  senderId,
  seatId,
  reactionId,
  requestId,
  now = new Date(),
  nextDiceValue = () => randomInt(1, 7),
  nextEventId = () => `REACTION-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
}) {
  const dice = reactionId === "gif_0";
  return {
    eventId: nextEventId(),
    requestId,
    roomId,
    senderId,
    seatId,
    reactionId,
    kind: dice ? "DICE" : "ANIMATION",
    diceValue: dice ? nextDiceValue() : null,
    createdAt: now.toISOString(),
  };
}

export function createAudioRoomReactionGuard({
  now = () => Date.now(),
  dedupeTtlMs = 30_000,
  rateCapacity = 3,
  rateRefillMs = 1_000,
  maximumEntries = 5_000,
} = {}) {
  const requests = new Map();
  const rates = new Map();

  function cleanup(currentTime) {
    for (const [key, entry] of requests) {
      if (entry.expiresAt <= currentTime) requests.delete(key);
    }
    for (const [key, entry] of rates) {
      if (currentTime - entry.lastSeenAt > 60_000) rates.delete(key);
    }
    while (requests.size > maximumEntries) requests.delete(requests.keys().next().value);
    while (rates.size > maximumEntries) rates.delete(rates.keys().next().value);
  }

  function consumeRateLimit(scope) {
    const currentTime = now();
    cleanup(currentTime);
    const previous = rates.get(scope) ?? {
      tokens: rateCapacity,
      refilledAt: currentTime,
      lastSeenAt: currentTime,
    };
    const elapsed = Math.max(0, currentTime - previous.refilledAt);
    const tokens = Math.min(rateCapacity, previous.tokens + elapsed / rateRefillMs);
    if (tokens < 1) {
      rates.set(scope, { tokens, refilledAt: currentTime, lastSeenAt: currentTime });
      return false;
    }
    rates.set(scope, { tokens: tokens - 1, refilledAt: currentTime, lastSeenAt: currentTime });
    return true;
  }

  async function runOnce(key, operation) {
    const currentTime = now();
    cleanup(currentTime);
    const existing = requests.get(key);
    if (existing?.expiresAt > currentTime) {
      return { duplicate: true, value: await existing.promise };
    }
    const promise = Promise.resolve().then(operation);
    requests.set(key, { promise, expiresAt: currentTime + dedupeTtlMs });
    try {
      return { duplicate: false, value: await promise };
    } catch (error) {
      requests.delete(key);
      throw error;
    }
  }

  return { consumeRateLimit, runOnce };
}

