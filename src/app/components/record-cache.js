"use client";

// Browser cache for portal record lists. Results are kept in memory and in this
// tab's sessionStorage (cleared when the tab closes or staff sign out), shown at
// once on return, and refreshed in the background.
const memory = new Map();
const PREFIX = "portal-records:";
const MAX_AGE_MS = 10 * 60 * 1000;
const inflight = new Map();

function storage() { try { return window.sessionStorage; } catch { return null; } }

export function readRecords(url) {
  const hit = memory.get(url);
  if (hit && Date.now() - hit.at < MAX_AGE_MS) return hit.data;
  try {
    const raw = storage()?.getItem(PREFIX + url);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (Date.now() - saved.at >= MAX_AGE_MS) return null;
    memory.set(url, saved);
    return saved.data;
  } catch { return null; }
}

function writeRecords(url, data) {
  const entry = { at: Date.now(), data };
  memory.set(url, entry);
  try { storage()?.setItem(PREFIX + url, JSON.stringify(entry)); } catch { /* storage full: memory only */ }
}

/** Fetch a page of records, sharing a request already in flight for the same URL. */
export function fetchRecords(url, signal) {
  let request = inflight.get(url);
  if (!request) {
    request = fetch(url, { cache: "no-store" })
      .then(async r => { const j = await r.json(); if (!r.ok) throw Error(j.error?.message || "Unable to load records."); writeRecords(url, j.data); return j.data; })
      .finally(() => inflight.delete(url));
    inflight.set(url, request);
  }
  if (!signal) return request;
  return new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    request.then(resolve, reject);
  });
}

/** Warm the cache for a page the user is likely to open next. */
export function prefetchRecords(url) {
  if (readRecords(url) || inflight.has(url)) return;
  fetchRecords(url).catch(() => {});
}

export function clearRecordCache() {
  memory.clear();
  try { const s = storage(); if (!s) return; for (const key of Object.keys(s)) if (key.startsWith(PREFIX)) s.removeItem(key); } catch {}
}
