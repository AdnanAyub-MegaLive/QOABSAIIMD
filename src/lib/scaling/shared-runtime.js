import { createRedisRuntime } from './redis-runtime.js';
const key = Symbol.for('portal.sharedRuntime');
const state = globalThis[key] ??= { runtime: null, pending: null };
export function sharedRuntime() {
  if (process.env.PORTAL_REDIS_URL && !state.runtime) throw Object.assign(new Error('Shared state is not initialized'), { code: 'REDIS_UNAVAILABLE' });
  return state.runtime;
}
export async function initializeSharedRuntime() {
  if (!process.env.PORTAL_REDIS_URL) return null;
  if (state.runtime) return state.runtime;
  state.pending ??= createRedisRuntime({ url: process.env.PORTAL_REDIS_URL, namespace: process.env.PORTAL_REDIS_NAMESPACE,
    onError: code => console.error('Shared state connection error', code) }).then(runtime => state.runtime = runtime).catch(error => { state.pending = null; throw error; });
  return state.pending;
}
export async function closeSharedRuntime() {
  await state.runtime?.close(); state.runtime = null; state.pending = null;
}
