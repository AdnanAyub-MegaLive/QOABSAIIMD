// Install synchronously, before the connection handler's first await.
module.exports = function socketReadyGate(socket, timeoutMs = 30000) {
  let settle, finished = false;
  const ready = new Promise(resolve => { settle = resolve; });
  const finish = ok => { if (!finished) { finished = true; clearTimeout(timer); settle(ok); } };
  const timer = setTimeout(() => { finish(false); socket.disconnect(true); }, timeoutMs);
  timer.unref?.();
  socket.use(async (packet, next) => {
    if (await ready) return next();
    const ack = packet[packet.length - 1];
    if (typeof ack === 'function') ack({ success: false, error: { code: 'SOCKET_INITIALIZATION_FAILED', message: 'Connection could not be prepared. Please reconnect.' } });
  });
  socket.once('disconnect', () => finish(false));
  return { ready: () => finish(true), fail: () => finish(false) };
};
