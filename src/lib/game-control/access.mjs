export function gameAccessLevels(game) {
  const minViewLevel = game.minViewLevel ?? 0;
  const minPlayLevel = game.minPlayLevel ?? minViewLevel;
  if (![minViewLevel,minPlayLevel].every(n => Number.isSafeInteger(n) && n >= 0) || minPlayLevel < minViewLevel) {
    throw new Error("Use whole, nonnegative levels. The play level must be at least the view level.");
  }
  return { minViewLevel, minPlayLevel };
}
export function gameAccess(game, user, level) {
  const { minViewLevel, minPlayLevel } = gameAccessLevels(game);
  if (level < minViewLevel) return "hidden";
  if (user.appRoles?.includes("RESELLER") || level < minPlayLevel) return "preview";
  return "play";
}
export async function gameUserLevel(db,userId) {
  const progress=await db.userProgress.findUnique({where:{userId_track:{userId,track:"USER"}},select:{currentLevel:true}});
  return progress?.currentLevel ?? 0;
}
