// Serialize provider mutations. A failed mutation is never recorded as applied.
export function permissionTransitions() {
  const applied = new Map(), pending = new Map();
  return {
    forget(key) { applied.delete(key); },
    async run(key, desired, change) {
      const previous = pending.get(key) ?? Promise.resolve();
      const operation = previous.catch(() => {}).then(async () => {
        const target = typeof desired === "function" ? await desired() : desired;
        if (applied.get(key) === target) return { configured: true, updated: false };
        const result = await change(target);
        applied.set(key, target);
        return result;
      });
      pending.set(key, operation);
      try { return await operation; }
      finally { if (pending.get(key) === operation) pending.delete(key); }
    },
  };
}
