// Bundled presentation assets; independent of game rules and wallet services.
export const gameIconArtwork = Object.freeze(Object.fromEntries(
  ['flip', 'roulette', 'pizza', 'teenpatti', 'rps', 'dice', 'penalty', 'reaction', 'trivia', 'highlow', 'wheel', 'dragon', 'slots']
    .map(engine => [engine, `/games/icons/${engine}-v1.webp`]),
));
