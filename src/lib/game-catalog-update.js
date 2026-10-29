// Notification only: never change rules, balances, rounds or settlement state.
export async function notifyGameIconUpdated(db, assetId) {
  try {
    const games = await db.gameDefinition.findMany({ where: { archivedAt: null,
      settings: { path: ["iconAssetId"], equals: assetId } }, select: { id: true } });
    if (games.length) await notifyGameCatalogUpdated(db, games.map(game => game.id));
  } catch (error) { console.error("Game icon notification failed", { code: error?.code ?? "UNKNOWN" }); }
}
export async function notifyGameCatalogUpdated(db, gameIds, io = globalThis.portalIo) {
  try {
    const [{ revision }] = await db.$queryRaw`SELECT nextval('"GameCatalogRevision"')::text AS revision`;
    const data = { revision, gameIds: [...new Set(gameIds)].sort(), changedAt: new Date().toISOString() };
    io?.emit("games:catalog-updated", { success: true, data });
    return data;
  } catch (error) {
    // The admin mutation has committed; notification failure must not invite retries.
    console.error("Game catalog notification failed", { code: error?.code ?? "UNKNOWN" });
    return null;
  }
}
