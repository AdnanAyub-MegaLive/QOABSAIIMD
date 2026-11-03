import { GET as get, POST as post } from '@/app/api/users/me/pretty-ids/route';
import { withV1Request, v1Options } from '@/lib/mobile-v1';
const options = { path: '/api/v1/users/me/pretty-ids', methods: 'GET, POST, OPTIONS' };
async function handle(request, handler) {
  const response = await withV1Request(request, options, () => handler(request));
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const GET = request => handle(request, get);
export const POST = request => handle(request, post);
export const OPTIONS = request => v1Options(request, options.methods);
