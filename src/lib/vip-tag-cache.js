const state = globalThis.portalVipTagCache ??= { ready: false, revision: 0, rows: null, until: 0, pending: null };

export function invalidateVipTags() {
  state.revision++;
  state.rows = null;
  state.pending = null;
  state.until = 0;
}

export function vipTagListenerConnection(ready) {
  state.ready = ready;
  invalidateVipTags();
}

export async function vipTagAssets(db) {
  if (state.ready && state.rows && state.until > Date.now()) return state.rows;
  if (state.ready && state.pending) return state.pending;
  const revision = state.revision;
  const load = db.uploadAsset.findMany({
    where: { active: true, archivedAt: null, category: "USER_TAGS", distribution: "VIP", minimumVipLevel: { not: null } },
    select: { publicId: true, mimeType: true, posterMimeType: true, mediaVersion: true, posterMediaVersion: true, minimumVipLevel: true },
    orderBy: [{ minimumVipLevel: "desc" }, { createdAt: "desc" }],
  }).then(rows => {
    if (state.ready && revision === state.revision) {
      state.rows = rows;
      state.until = Date.now() + 60000;
    }
    return rows;
  });
  if (state.ready) state.pending = load;
  try { return await load; }
  finally { if (state.pending === load) state.pending = null; }
}
