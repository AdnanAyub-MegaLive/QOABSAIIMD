// The portal's authenticated pages and API handlers already render dynamically.
// During the initial multi-worker rollout, do not retain incremental route/data
// entries in a worker: revalidatePath must never leave another worker stale.
// Static public assets and the image optimizer retain their existing caching.
module.exports = class NoStoreCache {
  async get() { return null; }
  async set() {}
  async revalidateTag() {}
  resetRequestCache() {}
};
