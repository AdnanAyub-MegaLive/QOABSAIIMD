import { resolveCatalogTrack } from "./music-catalog.js";

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
    state.source = "LOCAL";
    delete state.catalogTrackId;
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

export async function serializeRoomMusicForDelivery(state, origin) {
  const music = serializeRoomMusic(state);
  if (!music) return null;
  if (music.source !== "CATALOG" || !music.catalogTrackId) {
    const { trackUrl: _trackUrl, url: _url, ...localMusic } = music;
    return { ...localMusic, source: "LOCAL", trackUrl: null };
  }
  try {
    const track = await resolveCatalogTrack(music.catalogTrackId, origin, state?.audioRoomId ?? null);
    return { ...music, title: track.title, artist: track.artist, mimeType: track.mimeType, trackUrl: track.trackUrl };
  } catch (error) {
    if (error?.code !== "MUSIC_TRACK_NOT_FOUND") throw error;
    return { ...music, status: "STOPPED", startedAt: null, trackUrl: null, unavailable: true };
  }
}

const text = (value, max) => String(value ?? "").trim().slice(0, max);
const seconds = (value, max = 86400) => Math.min(max, Math.max(0, Number(value) || 0));

export function currentMusicPosition(music, now = new Date()) {
  if (!music) return 0;
  const base = seconds(music.positionSeconds);
  if (music.status !== "PLAYING" || !music.startedAt) return base;
  return seconds(base + Math.max(0, (now.getTime() - new Date(music.startedAt).getTime()) / 1000), Number(music.durationSeconds) || 86400);
}

export function nextRoomMusicState(action, input = {}, current = null, now = new Date(), publisherId = null, catalogTrack = null) {
  const command = String(action ?? "").toUpperCase();
  if (!['PLAY', 'PAUSE', 'SEEK', 'STOP'].includes(command)) throw Object.assign(new Error("Unsupported music action."), { code: "VALIDATION_ERROR" });
  if (command === "STOP") return current ? { ...current, status: "STOPPED", positionSeconds: 0, startedAt: null, publisherId } : null;
  if (!current && command !== "PLAY") throw Object.assign(new Error("No room music is currently selected."), { code: "ROOM_MUSIC_NOT_ACTIVE" });
  if (command === "PLAY") {
    const source = String(input.source ?? current?.source ?? "LOCAL").trim().toUpperCase() === "CATALOG" ? "CATALOG" : "LOCAL";
    if (source === "CATALOG" && !catalogTrack) throw Object.assign(new Error("The selected catalog track is unavailable."), { code: "MUSIC_TRACK_NOT_FOUND" });
    const title = text(catalogTrack?.title ?? input.title ?? current?.title, 160);
    if (!title) throw Object.assign(new Error("Music title is required."), { code: "VALIDATION_ERROR" });
    const durationSeconds = seconds(catalogTrack?.durationSeconds ?? input.durationSeconds ?? current?.durationSeconds, 86400);
    const positionSeconds = seconds(input.positionSeconds ?? (current ? currentMusicPosition(current, now) : 0), durationSeconds || 86400);
    return {
      source,
      catalogTrackId: source === "CATALOG" ? catalogTrack.id : null,
      localTrackId: source === "LOCAL" ? text(input.localTrackId ?? current?.localTrackId, 128) || null : null,
      title,
      artist: text(catalogTrack?.artist ?? input.artist ?? current?.artist, 160) || null,
      mimeType: source === "CATALOG" ? catalogTrack.mimeType : null,
      trackUrl: source === "CATALOG" ? catalogTrack.trackUrl : null,
      durationSeconds,
      status: "PLAYING",
      positionSeconds,
      startedAt: now.toISOString(),
      publisherId,
    };
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
