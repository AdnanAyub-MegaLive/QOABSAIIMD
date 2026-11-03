import { handlePk } from '@/lib/audio-room-pk-api';
import { mobileOptions } from '@/lib/mobile-api';
export const OPTIONS = mobileOptions;
export const GET = (r, c) => handlePk(r, c, true);
export const POST = (r, c) => handlePk(r, c, true);
export const DELETE = (r, c) => handlePk(r, c, true);
