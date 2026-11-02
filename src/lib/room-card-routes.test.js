import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('./prisma', () => ({ prisma: {
  audioRoom: { findMany: vi.fn() }, audioRoomVisit: { findMany: vi.fn() }, $queryRaw: vi.fn(),
} }));
vi.mock('./mobile-api', () => ({
  requireMobileUser: vi.fn(async () => ({ id: 'viewer' })),
  mobileJson: body => Response.json(body), mobileOptions: vi.fn(),
  mobileApiError: () => Response.json({ success: false }, { status: 500 }),
}));
vi.mock('./audio-room-maintenance', () => ({ reconcileExpiredAudioRoomRestrictions: vi.fn() }));
vi.mock('./user-perks', () => ({ requestOrigin: () => 'https://portal.example', resolveUserPerks: async () => new Map() }));
vi.mock('./media-payload', () => ({ versionMediaPayload: async body => body }));
vi.mock('./room-cover', () => ({ roomCoverDto: () => ({}) }));
vi.mock('./room-background', () => ({ serializeRoomBackground: () => null }));
vi.mock('./room-seat-style', () => ({ serializeRoomSeatStyle: () => null }));
vi.mock('./avatar-history', () => ({ avatarDisplayUrl: () => null }));

import { prisma } from './prisma';
import { GET as discover } from '../app/api/audio-rooms/discover/route';
import { GET as search } from '../app/api/audio-rooms/search/route';
import { GET as recent } from '../app/api/audio-rooms/recent/route';

beforeEach(() => {
  vi.clearAllMocks();
  const rooms = ['one', 'two'].map(roomId => ({ roomId, title: roomId, owner: { publicId: 'owner' } }));
  prisma.audioRoom.findMany.mockResolvedValue(rooms);
  prisma.audioRoomVisit.findMany.mockResolvedValue(rooms.map(audioRoom => ({ audioRoom, lastVisitedAt: new Date() })));
  prisma.$queryRaw.mockResolvedValue([
    { roomId: 'one', giftTotalCoins: '1500000', activeRedEnvelopeCount: 2 },
    { roomId: 'two', giftTotalCoins: '0', activeRedEnvelopeCount: 0 },
  ]);
});

it.each([['discover', discover], ['search', search], ['recent', recent]])('%s returns both card fields in one batched lookup', async (name, get) => {
  const response = await get(new Request(`https://portal.example/api/audio-rooms/${name}?q=room`));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.success).toBe(true);
  expect(body.data.rooms).toEqual([
    expect.objectContaining({ roomId: 'one', giftTotalCoins: '1500000', activeRedEnvelopeCount: 2 }),
    expect.objectContaining({ roomId: 'two', giftTotalCoins: '0', activeRedEnvelopeCount: 0 }),
  ]);
  expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  expect(prisma.$queryRaw.mock.calls[0][0].values).toEqual(['one', 'two']);
});
