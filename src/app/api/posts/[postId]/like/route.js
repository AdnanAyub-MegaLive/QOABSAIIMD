import { postSocialRequest } from "@/lib/post-social-api";
import { mobileOptions } from "@/lib/mobile-api";
export function OPTIONS() { return mobileOptions(); }
export function PUT(request, { params }) { return postSocialRequest(request, params, "like"); }
export function DELETE(request, { params }) { return postSocialRequest(request, params, "unlike"); }
