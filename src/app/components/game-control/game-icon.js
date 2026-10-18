import Image from 'next/image';
import { Gamepad2 } from 'lucide-react';
import { gameIconArtwork } from '@/lib/game-control/icon-artwork';

export default function GameIcon({ engine, size = 48 }) {
  const src = gameIconArtwork[engine];
  if (!src) return <Gamepad2 size={size} aria-hidden="true" />;
  return <Image src={src} alt="" width={size} height={size} unoptimized
    style={{ width: size, height: size, maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '22%' }} />;
}
