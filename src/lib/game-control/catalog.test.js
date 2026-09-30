import { describe, expect, it } from "vitest";
import { validateLaunchUrl, visibleGames } from "./catalog.mjs";
import { validateGame, resolveRound } from "./rules.mjs";

describe("mobile room game links", () => {
  it("rejects executable URLs, credentials and production HTTP", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,test", "file:///game.html", "https://user:secret@example.com", "http://192.168.88.49:3000/game"])
      expect(() => validateLaunchUrl(url, false)).toThrow();
    expect(validateLaunchUrl("http://192.168.88.49:3000/game", true)).toContain("192.168.88.49");
  });
  it("returns active games in order with distinct session requirements", () => {
    const games = visibleGames([
      { id: "roulette", engine: "roulette", status: "active", sortOrder: 2 },
      { id: "linked", engine: "external", status: "active", sortOrder: 1, launchUrl: "https://games.example.com/play" },
      { id: "hidden", engine: "external", status: "paused", launchUrl: "https://games.example.com/hidden" },
      { id: "invalid", engine: "external", status: "active", launchUrl: "javascript:alert(1)" },
    ], "https://portal.example.com");
    expect(games.map(g => g.id)).toEqual(["linked", "roulette"]);
    expect(games[0].requiresPortalSession).toBe(false);
    expect(games[0].launchUrl).toBe("https://games.example.com/play");
    expect(games[1].requiresPortalSession).toBe(true);
    expect(games[1].launchUrl).toContain("/games/play?game=roulette");
  });
  it("validates linked games without wagers and refuses flip settlement", () => {
    const game = validateGame({ id: "linked-game", name: "My Game", engine: "external", status: "active", launchUrl: "https://games.example.com" });
    expect(game.sortOrder).toBe(0);
    expect(() => resolveRound(game, 10, "heads", 0)).toThrow();
    expect(() => validateGame({ ...game, sortOrder: -1 })).toThrow();
  });
});
