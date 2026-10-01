import { postSocialRequest } from "@/lib/post-social-api";
import { mobileOptions } from "@/lib/mobile-api";
export function OPTIONS() { return mobileOptions(); }
export function DELETE(request, { params }) { return postSocialRequest(request, params, "delete"); }
