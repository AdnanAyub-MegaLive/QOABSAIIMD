export function validateLaunchUrl(value, development = process.env.NODE_ENV !== "production") {
  let url;
  try { url = new URL(value); } catch { throw new Error("Enter a valid game URL."); }
  const local = /^(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname);
  if (url.username || url.password || (url.protocol !== "https:" && !(development && local && url.protocol === "http:")))
    throw new Error("Use HTTPS for game links (local HTTP is supported in development only).");
  if (url.href.length > 2048) throw new Error("The game URL is too long.");
  return url.href;
}

export function catalogGame(game, origin) {
  const external = game.engine === "external";
  return { ...game, sortOrder: game.sortOrder ?? 0,
    launchUrl: external ? validateLaunchUrl(game.launchUrl) : `${origin.replace(/\/$/, "")}/games/play?game=${encodeURIComponent(game.id)}`,
    requiresPortalSession: !external };
}

export function visibleGames(games, origin) {
  return games.filter(game => game.status === "active").flatMap(game => {
    try { return [catalogGame(game, origin)]; } catch { return []; }
  }).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}
