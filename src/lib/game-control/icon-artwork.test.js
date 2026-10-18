import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { gameIconArtwork } from './icon-artwork.js';

it('bundles one optimized square icon for each game', async () => {
  expect(Object.keys(gameIconArtwork)).toHaveLength(13);
  for (const url of Object.values(gameIconArtwork)) {
    const buffer = await readFile(`public${url}`);
    const meta = await sharp(buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);
    expect(buffer.length).toBeLessThan(100_000);
  }
});
