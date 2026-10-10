import { GET as get, POST as post, PATCH as patch } from "@/app/api/wallet/currency-requests/route";
import { withV1Request, v1Options } from "@/lib/mobile-v1";
const path="/api/v1/wallet/currency-requests",methods="GET, POST, PATCH, OPTIONS";
export const runtime="nodejs";
export function OPTIONS(request){return v1Options(request,methods);}
export function GET(request){return withV1Request(request,{path,methods},()=>get(request));}
export function POST(request){return withV1Request(request,{path,methods},()=>post(request));}
export function PATCH(request){return withV1Request(request,{path,methods},()=>patch(request));}
