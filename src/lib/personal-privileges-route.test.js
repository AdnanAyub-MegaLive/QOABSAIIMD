import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), save: vi.fn(), invalidate: vi.fn() }));
vi.mock('./prisma.js', () => ({ prisma: { vipMembership: { findUnique: m.find } } }));
vi.mock('./mobile-api.js', () => ({
  requireMobileUser: m.auth,
  mobileJson: async (body, status = 200) => Response.json(body, { status }),
  mobileApiError: error => Response.json({ success: false, error: { code: error.message } }, { status: 401 }),
  mobileOptions: () => new Response(null, { status: 204 }),
}));
vi.mock('./chat-perks-cache', () => ({ invalidateChatPerks: m.invalidate }));
import { GET } from '../app/api/v1/users/me/privileges/route.js';
beforeEach(() => { vi.clearAllMocks(); m.auth.mockResolvedValue({ id: 'qa' }); });
it('awaits the asynchronous response and returns private privileges', async () => {
  m.find.mockResolvedValue({ startsAt: new Date(0), expiresAt: new Date(Date.now() + 60000), disabledPrivileges: ['ANTI_KICK'], tier: { active: true, privileges: ['ANTI_KICK'] } });
  const response = await GET(new Request('https://portal.test/api/v1/users/me/privileges'));
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect((await response.json()).data.items).toEqual([expect.objectContaining({ key: 'ANTI_KICK', enabled: false })]);
  expect(m.find).toHaveBeenCalledWith({ where: { userId: 'qa' }, include: { tier: true } });
});
it('returns an empty list without a membership', async () => {
  m.find.mockResolvedValue(null);
  expect(await (await GET(new Request('https://portal.test'))).json()).toEqual({ success: true, data: { items: [] } });
});
it('retains authentication before membership lookup', async () => {
  m.auth.mockRejectedValue(new Error('INVALID_SESSION'));
  expect((await GET(new Request('https://portal.test'))).status).toBe(401);
  expect(m.find).not.toHaveBeenCalled();
});
