import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { gameIconArtwork } from './icon-artwork.js';
import { visibleGames } from './catalog.mjs';

it('returns absolute artwork URLs for all built-in mobile catalogue entries', () => {
  const games = Object.keys(gameIconArtwork).map(engine => ({id: engine, engine, status: 'active'}));
  const result = visibleGames(games, 'https://portal.megachat.live/');
  expect(result).toHaveLength(14);
  for (const game of result) {
    expect(game.iconUrl).toBe(`https://portal.megachat.live${gameIconArtwork[game.engine]}`);
    expect(game.imageUrl).toBe(game.iconUrl);
    expect(game.iconMimeType).toBe('image/webp');
    expect(game.iconVersion).toBe(game.engine === 'rocket' ? 'v2' : 'v1');
  }
});

it('preserves external artwork and does not show paused games', () => {
  const external = {id:'external',engine:'external',status:'active',launchUrl:'https://example.com/game',iconUrl:'https://example.com/icon.png'};
  const result = visibleGames([external,{id:'pizza',engine:'pizza',status:'paused'}], 'https://portal.megachat.live');
  expect(result).toHaveLength(1);
  expect(result[0].iconUrl).toBe(external.iconUrl);
});

it('bundles one optimized square icon for each game', async () => {
  expect(Object.keys(gameIconArtwork)).toHaveLength(14);
  for (const url of Object.values(gameIconArtwork)) {
    const buffer = await readFile(`public${url}`);
    const meta = await sharp(buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);
    expect(buffer.length).toBeLessThan(100_000);
  }
});
