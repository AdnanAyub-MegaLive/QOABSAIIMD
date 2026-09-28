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
  }
  return { kind, state };
}

export function serializeEntertainment(state) {
  return { revision: state?.revision ?? 0, music: state?.music ?? null, game: state?.game ?? null, campaign: state?.campaign ?? null, watch: state?.watch ?? null, updatedAt: state?.updatedAt?.toISOString?.() ?? null };
}
