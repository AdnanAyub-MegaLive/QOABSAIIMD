import { describe, it, expect } from "vitest";
import { updatePortalActivity, PORTAL_IDLE_SECONDS } from "./portal-idle-session";

describe("portal inactivity", () => {
  const now = 10000000;
  it("starts at server login time", () => {
    expect(updatePortalActivity({}, { signedIn: true, now }).lastActivityAt).toBe(now);
  });
  it("background reads do not prolong activity", () => {
    expect(updatePortalActivity({ lastActivityAt: now - 1000 }, { now }).lastActivityAt).toBe(now - 1000);
  });
  it("activity renews an unexpired session", () => {
    expect(updatePortalActivity({ lastActivityAt: now - 1000 }, { now, activity: true }).lastActivityAt).toBe(now);
  });
  it("activity cannot revive an expired session", () => {
    expect(updatePortalActivity({ lastActivityAt: now - PORTAL_IDLE_SECONDS * 1000 }, { now, activity: true })).toBeNull();
  });
  it("uses issued time for older sessions and rejects missing timestamps", () => {
    expect(updatePortalActivity({ iat: now / 1000 }, { now }).lastActivityAt).toBe(now);
    expect(updatePortalActivity({}, { now })).toBeNull();
  });
});
