import { randomBytes } from "node:crypto";
import { DAY_MS, sharedClock, sharedDuration } from "./shared-engine.mjs";

export function utcGameDay(now) {
  const start = Math.floor(now / DAY_MS) * DAY_MS;
  return { start, end: start + DAY_MS, date: new Date(start).toISOString().slice(0, 10) };
}

export function activeGameSchedule(db, gameId, now) {
  const { start } = utcGameDay(now);
  return db.sharedGameDay.findFirst({
    where: { gameId, day: { gte: new Date(start), lte: new Date(now) } },
    orderBy: { day: "desc" },
  });
}

// Writes require the GameDefinition row lock, shared with saves and placement.
// readOnly returns undefined when a write is needed, allowing normal polls to avoid locks.
// A schedule that has started is immutable: entries retain its seed and rules.
export async function scheduleGameSettings(db, game, now, current, readOnly = false) {
  current ??= await activeGameSchedule(db, game.id, now);
  if (!current || current.settings.revision === game.revision) return null;
  const clock = sharedClock(current, now), { end } = utcGameDay(now);
  const startsAt = clock.phase === "reset" ? end : clock.endsAt;
  if (startsAt + sharedDuration(game) > end) {
    if (readOnly) return undefined;
    // A previous edit may have scheduled a shorter round at this boundary.
    await db.sharedGameDay.deleteMany({ where: { gameId: game.id, day: { gt: new Date(now), lt: new Date(end) } } });
    return end;
  }
  const settings = { ...game, outcomeScope: "application-v1", scheduleRoundOffset: clock.roundNumber };
  const id = `${game.id}:${new Date(startsAt).toISOString()}`;
  const pending = await db.sharedGameDay.findUnique({ where: { id } });
  if (pending?.settings.revision === game.revision) return startsAt;
  if (readOnly) return undefined;
  await db.sharedGameDay.upsert({
    where: { id },
    create: { id, gameId: game.id, day: new Date(startsAt), settings, durationMs: sharedDuration(settings), seed: randomBytes(32).toString("hex") },
    // Several saves before the boundary coalesce. This future schedule cannot
    // have accepted bets because all entry requests use activeGameSchedule.
    update: { settings, durationMs: sharedDuration(settings) },
  });
  return startsAt;
}
