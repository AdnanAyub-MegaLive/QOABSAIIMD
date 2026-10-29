import { GET as baseGet } from '../../../../audio-rooms/[roomId]/seat-requests/route';
import { withV1Request, v1Options } from '@/lib/mobile-v1';
const methods='GET, OPTIONS';
export function OPTIONS(request){return v1Options(request,methods);}
export const runtime='nodejs';
export async function GET(request,context){return withV1Request(request,{path:'/api/v1/audio-rooms/:roomId/seat-requests',methods,rateLimit:{limit:60,windowMs:60000}},()=>baseGet(request,context));}
