import { POST as post } from '@/app/api/gifts/send-combo/route';
import { v1Options, withV1Request } from '@/lib/mobile-v1';

export const runtime = 'nodejs';
const methods = 'POST, OPTIONS';
export function OPTIONS(request) { return v1Options(request, methods); }
export function POST(request) {
  return withV1Request(request, { path: '/api/v1/gifts/send-combo', methods }, () => post(request));
}
