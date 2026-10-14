// Explicitly scoped production QA: only the two dedicated accounts below.
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
dotenv.config({ path: ".env.local", quiet: true });
const { prisma } = await import("../src/lib/prisma.js");
const { default: sessions } = await import("../src/lib/mobile-session.cjs");
const { awardActivityXp } = await import("../src/lib/activity-levels.js");
const { default: bcrypt } = await import("bcrypt");
const sockets = [];
let room;
function connect(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("wss://portal.megachat.live/socket.io/?EIO=4&transport=websocket");
    sockets.push(ws);
    const pending = new Map(), events = [];
    let counter = 0;
    const timer = setTimeout(() => reject(new Error("Socket connect timeout")), 15000);
    ws.onerror = () => reject(new Error("Socket error"));
    ws.onmessage = ({ data }) => {
      const text = String(data);
      if (text.startsWith("0")) ws.send(`40${JSON.stringify({ token })}`);
      else if (text === "2") ws.send("3");
      else if (text.startsWith("40")) {
        clearTimeout(timer);
        resolve({ events, call: (name, input) => new Promise((done, fail) => {
          const id = ++counter;
          const timeout = setTimeout(() => { pending.delete(id); fail(new Error(`${name} timeout`)); }, 15000);
          pending.set(id, value => { clearTimeout(timeout); done(value); });
          ws.send(`42${id}${JSON.stringify([name, input])}`);
        }) });
      } else if (text.startsWith("43")) {
        const match = /^43(\d+)(\[.*)$/s.exec(text);
        if (match) { pending.get(Number(match[1]))?.(JSON.parse(match[2])[0]); pending.delete(Number(match[1])); }
      } else if (text.startsWith("42[")) events.push(JSON.parse(text.slice(2)));
      else if (text.startsWith("44")) { clearTimeout(timer); reject(new Error("Socket authentication rejected")); }
    };
  });
}
try {
  const users = await prisma.user.findMany({ where: { publicId: { in: ["USR-696194", "USR-372931"] } } });
  const a = users.find(u => u.publicId === "USR-696194"), b = users.find(u => u.publicId === "USR-372931");
  if (!a?.name.startsWith("QA SVGA Verification") || !b?.name.startsWith("QA SVGA Verification")) throw new Error("QA identity guard failed");
  const badge = await prisma.userEquippedProp.findUnique({ where: { userId_category: { userId: a.id, category: "BADGES" } }, include: { asset: true } });
  if (badge?.asset.mimeType !== "application/svga") throw new Error("QA badge missing");
  const password = randomUUID();
  room = await prisma.audioRoom.create({ data: { roomId: `ROOM-QA-${randomUUID()}`, ownerId: b.id, title: "Private SVGA QA", privacyMode: "PASSWORD", passwordHash: await bcrypt.hash(password, 10), seatLayout: [1] } });
  process.env.MOBILE_SESSION_TTL_SECONDS = "300";
  const [sa, sb] = await Promise.all([connect(sessions.createMobileSessionToken(a)), connect(sessions.createMobileSessionToken(b))]);
  const ownerJoin = await sb.call("audio-room:join", { roomId: room.roomId, password });
  const memberJoin = await sa.call("audio-room:join", { roomId: room.roomId, password });
  const seat = await sa.call("audio-room:seat-take", { roomId: room.roomId, seatId: "row0-seat1" });
  const chat = await sa.call("audio-room:message", { roomId: room.roomId, body: "Isolated SVGA QA message", requestId: randomUUID() });
  const sourceId = `qa-svga-${randomUUID()}`;
  // Rule exists only inside this transaction; other users never observe it.
  await prisma.$transaction(async tx => {
    if (await tx.activityLevelRule.findUnique({ where: { track: "GAME" } })) throw new Error("Existing GAME configuration: test refused");
    await tx.activityLevelRule.create({ data: { track: "GAME", enabled: true, rateBps: 10000, levels: [{ level: 0, threshold: "0" }, { level: 1, threshold: "1", badgeAssetId: badge.asset.publicId }] } });
    await awardActivityXp(tx, "GAME", a.id, sourceId, 1n);
    await tx.activityLevelRule.delete({ where: { track: "GAME" } });
  });
  for (let n = 0; n < 20 && !sa.events.some(e => e[0] === "activity-progression:updated"); n++) await new Promise(r => setTimeout(r, 500));
  const level = sa.events.find(e => e[0] === "activity-progression:updated")?.[1]?.data;
  const message = sb.events.find(e => e[0] === "audio-room:message")?.[1]?.data;
  const seatEvents = sb.events.filter(e => e[0] === "audio-room:seat-update");
  const mediaResponse = level?.badgeUrl ? await fetch(level.badgeUrl) : null;
  console.log(JSON.stringify({ accounts: [a.publicId, b.publicId], roomId: room.roomId, ownerJoin: ownerJoin.success, memberJoin: memberJoin.success, seat: seat.success, chat: chat.success, chatObserverBadgeMime: message?.sender?.badgeMimeType, seatObserverHasSvga: seatEvents.some(e => JSON.stringify(e).includes('application/svga')), levelEvent: Boolean(level), level: level?.level, badgeHttpStatus: mediaResponse?.status, badgeHost: mediaResponse ? new URL(mediaResponse.url).host : null, ruleRestoredAbsent: !(await prisma.activityLevelRule.findUnique({ where: { track: "GAME" } })) }));
} finally {
  for (const ws of sockets) ws.close();
  if (room) await prisma.audioRoom.update({ where: { id: room.id }, data: { status: "ENDED" } });
  await prisma.$disconnect();
}
