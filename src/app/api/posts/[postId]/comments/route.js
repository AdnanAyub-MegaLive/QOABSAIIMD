import { postSocialRequest } from "@/lib/post-social-api";
import { mobileOptions } from "@/lib/mobile-api";
export function OPTIONS() { return mobileOptions(); }
export function GET(request, { params }) { return postSocialRequest(request, params, "list"); }
export function POST(request, { params }) { return postSocialRequest(request, params, "create"); }
