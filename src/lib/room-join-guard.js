export function createRoomJoinGuard() {
  const inFlight = new Map();
  return async function join(key, operation, acknowledge) {
    let work = inFlight.get(key);
    if (!work) {
      work = Promise.resolve().then(operation);
      inFlight.set(key, work);
    }
    try { acknowledge(await work); }
    finally { if (inFlight.get(key) === work) inFlight.delete(key); }
  };
}
