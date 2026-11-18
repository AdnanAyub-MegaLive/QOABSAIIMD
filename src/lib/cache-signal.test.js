import { describe, expect, it, vi } from "vitest";
import { cacheScopesFor, signalCacheForEvent, signalAllCache, signalUserCache } from "./cache-signal.js";

const fakeIo = () => { const emit = vi.fn(); const to = vi.fn(() => ({ emit })); return { io: { to, emit }, to, emit }; };

describe("cache signal", () => {
  it("maps profile and level events to scopes", () => {
    expect(cacheScopesFor("props:updated")).toEqual(["profile"]);
    expect(cacheScopesFor("progression:updated")).toEqual(["progression"]);
    expect(cacheScopesFor("gift:received")).toBeNull();
  });
  it("signals the user channel for mapped user events only", () => {
    const { io, to, emit } = fakeIo();
    signalCacheForEvent(io, "user:USR-1", "vip:updated");
    expect(to).toHaveBeenCalledWith("user:USR-1");
    expect(emit).toHaveBeenCalledWith("cache:invalidate", expect.objectContaining({ data: expect.objectContaining({ scopes: ["profile"], userId: "USR-1", reason: "vip:updated" }) }));
    to.mockClear();
    signalCacheForEvent(io, "audio-room:R1", "vip:updated");
    signalCacheForEvent(io, "user:USR-1", "gift:received");
    expect(to).not.toHaveBeenCalled();
  });
  it("broadcasts global signals and tolerates a missing socket server", () => {
    const { io } = fakeIo();
    signalAllCache(io, ["progression"]);
    expect(io.emit).toHaveBeenCalledWith("cache:invalidate", expect.objectContaining({ data: expect.objectContaining({ scopes: ["progression"], global: true }) }));
    expect(() => signalUserCache(undefined, "USR-1", ["profile"])).not.toThrow();
  });
});

describe("progression signal only on level change", () => {
  it("skips plain XP gains and signals real level-ups", () => {
    const emit = vi.fn(); const io = { to: vi.fn(() => ({ emit })) };
    signalCacheForEvent(io, "user:USR-1", "progression:updated", { data: { levelsGained: [] } });
    signalCacheForEvent(io, "user:USR-1", "progression:updated", { data: {} });
    expect(emit).not.toHaveBeenCalled();
    signalCacheForEvent(io, "user:USR-1", "progression:updated", { data: { levelsGained: [3] } });
    expect(emit).toHaveBeenCalledWith("cache:invalidate", expect.objectContaining({ data: expect.objectContaining({ scopes: ["progression"] }) }));
  });
});
