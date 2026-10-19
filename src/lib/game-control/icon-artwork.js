// Bundled presentation assets; independent of game rules and wallet services.
export function iconAssetSetting(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^AST-[A-Za-z0-9-]{1,80}$/.test(value)) throw new Error('Select a valid game icon.');
  return value;
}
export const gameIconArtwork = Object.freeze(Object.fromEntries(
  ['rocket', 'flip', 'roulette', 'pizza', 'teenpatti', 'rps', 'dice', 'penalty', 'reaction', 'trivia', 'highlow', 'wheel', 'dragon', 'slots']
    .map(engine => [engine, `/games/icons/${engine}-${engine === "rocket" ? "v2" : "v1"}.webp`]),
));
