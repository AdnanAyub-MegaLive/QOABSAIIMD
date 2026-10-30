import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), prior: vi.fn(), run: vi.fn(), prepare: vi.fn(), limited: vi.fn() }));
vi.mock('./prisma.js', () => ({ prisma: {} }));
vi.mock('./gift-operation', async original => ({ ...await original(), priorGiftOperation: mocks.prior, runGiftOperation: mocks.run }));
vi.mock('./multi-gift-settlement', () => ({ prepareMultiGift: mocks.prepare }));
vi.mock('./rate-limit', () => ({ isRateLimited: mocks.limited }));
vi.mock('./mobile-api', () => ({ requireMobileUser: mocks.auth, mobileOptions: vi.fn(),
  giftJson: (body, status) => Response.json(body, { status }),
  mobileApiError: (error, fallback) => Response.json({ success: false, error: { code: error.code ?? fallback } }, { status: error.code === 'INVALID_SESSION' ? 401 : 422 }),
}));
import { POST } from '../app/api/gifts/send-combo/route';
const body = { giftId: 'AST-1', roomId: 'ROOM-1', recipientIds: ['USR-A'], comboId: 'combo-1', tapIds: ['tap-0001', 'tap-0002'] };
const request = (data = body) => new Request('https://portal.test/api/gifts/send-combo', { method: 'POST', headers: { 'Idempotency-Key': 'batch-001' }, body: JSON.stringify(data) });
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ id: 'sender' });
  mocks.prepare.mockResolvedValue({ contentionKeys: ['pool:lucky:GLOBAL'], settle: vi.fn(), finalize: vi.fn() });
  mocks.run.mockResolvedValue({ requestId: 'batch-001', taps: [], senderCoinBalance: '100' });
});
it('authenticates once and dispatches one bounded transaction with individual tap IDs', async () => {
  expect((await POST(request())).status).toBe(201);
  expect(mocks.auth).toHaveBeenCalledOnce();expect(mocks.prepare).toHaveBeenCalledOnce();expect(mocks.run).toHaveBeenCalledOnce();
  expect(mocks.run.mock.calls[0][1].taps.map(tap => tap.key)).toEqual(body.tapIds);
  expect(mocks.run.mock.calls[0][1].contentionKeys).toEqual(['pool:lucky:GLOBAL']);
  expect(mocks.run.mock.calls[0][1].finalize).toBeTypeOf('function');
});
it('returns saved retries without rechecking room membership or drawing again', async () => {
  const saved = { requestId: 'batch-001', taps: [{ tapId: 'tap-0001' }], senderCoinBalance: '900' };
  mocks.prior.mockResolvedValue(saved);
  const response = await POST(request());expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual(saved);
  expect(mocks.prepare).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();
});
it('rejects missing authentication, invalid batches and rate-limited callers before settlement', async () => {
  mocks.auth.mockRejectedValueOnce(Object.assign(Error(), { code: 'INVALID_SESSION' }));
  expect((await POST(request())).status).toBe(401);
  expect((await POST(request({ ...body, tapIds: ['tap-0001', 'tap-0001'] }))).status).toBe(422);
  mocks.limited.mockReturnValue(true);expect((await POST(request())).status).toBe(429);
  expect(mocks.prepare).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();
});
it('returns insufficient Coins as a safe 409', async () => {
  mocks.run.mockRejectedValue(Error('INSUFFICIENT_COINS'));
  const response = await POST(request());expect(response.status).toBe(409);
  expect((await response.json()).error.code).toBe('INSUFFICIENT_COINS');
});
