// Server-side bytes only. Callers must authenticate and read current asset metadata
// BEFORE using this cache; it never caches authorization or HTTP responses.
export function createMediaByteCache({ maxBytes = 64 * 1024 * 1024, maxItemBytes = 8 * 1024 * 1024, maxEntries = 128, ttlMs = 300000, now = Date.now } = {}) {
  const entries = new Map(), pending = new Map();
  let size = 0;
  const remove = key => { const entry = entries.get(key); if (entry) size -= entry.size; entries.delete(key); };
  return {
    clear() { entries.clear(); size = 0; },
    async get(assetId, poster, version, load) {
      // Legacy unversioned files can change in place and must not be cached.
      if (!version) return load();
      const key = JSON.stringify([assetId, poster, version]);
      const hit = entries.get(key);
      if (hit && hit.until > now()) { entries.delete(key); entries.set(key, hit); return hit.value; }
      remove(key);
      if (pending.has(key)) return pending.get(key);
      const work = Promise.resolve().then(load).then(value => {
        const bytes = value?.[poster ? 'posterFileData' : 'fileData'];
        const actual = value?.[poster ? 'posterMediaVersion' : 'mediaVersion'];
        if (actual !== version || !bytes || bytes.byteLength > maxItemBytes || bytes.byteLength > maxBytes) return value;
        remove(key);
        for (const [id, entry] of entries) if (entry.until <= now()) remove(id);
        while (entries.size && (size + bytes.byteLength > maxBytes || entries.size >= maxEntries)) remove(entries.keys().next().value);
        if (maxEntries > 0) { entries.set(key, { value, size: bytes.byteLength, until: now() + ttlMs }); size += bytes.byteLength; }
        return value;
      }).finally(() => { if (pending.get(key) === work) pending.delete(key); });
      // Bound coordination state too, even for adversarial distinct asset requests.
      if (pending.size < maxEntries) pending.set(key, work);
      return work;
    },
  };
}

export const mediaByteCache = createMediaByteCache();
