import { describe, expect, it } from "vitest";
import { serializeDailyTask, utcDayStart, utcWeekStart } from "./daily-tasks";

const definition = {
  type: "ROOM_WATCH",
  title: "Watch 10 minutes of live",
  description: "Watch a room.",
  rewardCoins: 1000n,
  targetValue: 600,
  unit: "SECONDS",
  icon: "watch",
  iconUrl: null,
};

describe("daily task contract helpers", () => {
  it("calculates stable UTC day and Monday week boundaries", () => {
    const now = new Date("2026-09-23T18:45:00.000Z");
    expect(utcDayStart(now).toISOString()).toBe("2026-09-23T00:00:00.000Z");
    expect(utcWeekStart(now).toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });

  it("serializes task progress for the RN contract", () => {
    expect(
      serializeDailyTask({
        id: "task-instance",
        definition,
        progressValue: 360,
        state: "PROGRESS",
        claimedAt: null,
      }),
    ).toEqual({
      id: "task-instance",
      title: definition.title,
      description: definition.description,
      reward: 1000,
      state: "progress",
      progress: 0.6,
      progressLabel: "6 min / 10 min",
      icon: "watch",
      type: "ROOM_WATCH",
    });
  });

  it("emits claim and completed states without progress fields", () => {
    const claim = serializeDailyTask({
      id: "ready",
      definition,
      progressValue: 600,
      state: "CLAIM",
      claimedAt: null,
    });
    const completed = serializeDailyTask({
      id: "done",
      definition,
      progressValue: 600,
      state: "COMPLETED",
      claimedAt: new Date(),
    });
    expect(claim.state).toBe("claim");
    expect(claim).not.toHaveProperty("progress");
    expect(completed.state).toBe("completed");
  });
});
