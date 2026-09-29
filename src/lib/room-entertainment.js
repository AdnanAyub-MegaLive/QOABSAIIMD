const allowedKinds = new Set(["music", "game", "campaign", "watch"]);

export function normalizeEntertainmentUpdate(body) {
  const kind = String(body?.kind ?? "").trim().toLowerCase();
  if (!allowedKinds.has(kind)) throw Object.assign(new Error("Entertainment kind must be music, game, campaign, or watch."), { code: "VALIDATION_ERROR" });
  if (body?.state === null) return { kind, state: null };
  if (!body?.state || typeof body.state !== "object" || Array.isArray(body.state)) throw Object.assign(new Error("Entertainment state must be an object or null."), { code: "VALIDATION_ERROR" });
  const encoded = JSON.stringify(body.state);
  if (encoded.length > 8000) throw Object.assign(new Error("Entertainment state is too large."), { code: "VALIDATION_ERROR" });
  const state = JSON.parse(encoded);
  if (kind === "music") {
    state.status = ["PLAYING", "PAUSED", "STOPPED"].includes(String(state.status).toUpperCase()) ? String(state.status).toUpperCase() : "STOPPED";
    state.positionMs = Math.max(0, Math.floor(Number(state.positionMs) || 0));
    delete state.localUri;
    delete state.filePath;
    delete state.contentUri;
    delete state.trackUrl;
    delete state.url;
  }
  return { kind, state };
}

export function serializeEntertainment(state) {
  return { revision: state?.revision ?? 0, music: state?.music ?? null, game: state?.game ?? null, campaign: state?.campaign ?? null, watch: state?.watch ?? null, updatedAt: state?.updatedAt?.toISOString?.() ?? null };
}

export function serializeRoomMusic(state) {
  if (!state?.music) return null;
  return { ...state.music, revision: state.revision ?? 0, updatedAt: state.updatedAt?.toISOString?.() ?? null };
}

const text = (value, max) => String(value ?? "").trim().slice(0, max);
const seconds = (value, max = 86400) => Math.min(max, Math.max(0, Number(value) || 0));

export function currentMusicPosition(music, now = new Date()) {
  if (!music) return 0;
  const base = seconds(music.positionSeconds);
  if (music.status !== "PLAYING" || !music.startedAt) return base;
  return seconds(base + Math.max(0, (now.getTime() - new Date(music.startedAt).getTime()) / 1000), Number(music.durationSeconds) || 86400);
}

export function nextRoomMusicState(action, input = {}, current = null, now = new Date(), publisherId = null) {
  const command = String(action ?? "").toUpperCase();
  if (!['PLAY', 'PAUSE', 'SEEK', 'STOP'].includes(command)) throw Object.assign(new Error("Unsupported music action."), { code: "VALIDATION_ERROR" });
  if (command === "STOP") return current ? { ...current, status: "STOPPED", positionSeconds: 0, startedAt: null, publisherId } : null;
  if (!current && command !== "PLAY") throw Object.assign(new Error("No room music is currently selected."), { code: "ROOM_MUSIC_NOT_ACTIVE" });
  if (command === "PLAY") {
    const title = text(input.title ?? current?.title, 160);
    if (!title) throw Object.assign(new Error("Music title is required."), { code: "VALIDATION_ERROR" });
    const durationSeconds = seconds(input.durationSeconds ?? current?.durationSeconds, 86400);
    const positionSeconds = seconds(input.positionSeconds ?? (current ? currentMusicPosition(current, now) : 0), durationSeconds || 86400);
    return { localTrackId: text(input.localTrackId ?? current?.localTrackId, 128) || null, title, artist: text(input.artist ?? current?.artist, 160) || null, durationSeconds, status: "PLAYING", positionSeconds, startedAt: now.toISOString(), publisherId };
  }
  const positionSeconds = command === "SEEK" ? seconds(input.positionSeconds, Number(current.durationSeconds) || 86400) : currentMusicPosition(current, now);
  return {
    ...current,
    status: command === "PAUSE" ? "PAUSED" : current.status,
    positionSeconds,
    startedAt: command === "SEEK" && current.status === "PLAYING" ? now.toISOString() : null,
    publisherId,
  };
}
