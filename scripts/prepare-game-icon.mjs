import sharp from 'sharp';
import { mkdir, access } from 'node:fs/promises';
import { gameIconArtwork } from '../src/lib/game-control/icon-artwork.js';

const [engine, source] = process.argv.slice(2);
if (!gameIconArtwork[engine] || !source) throw new Error('Usage: node scripts/prepare-game-icon.mjs <engine> <generated PNG path>');
await mkdir('public/games/icons', { recursive: true });
const target = `public${gameIconArtwork[engine]}`;
try { await access(target); throw new Error(`Refusing to overwrite ${target}`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await sharp(source).resize(256, 256, { fit: 'contain' }).webp({ quality: 88 }).toFile(target);
console.log(target);
