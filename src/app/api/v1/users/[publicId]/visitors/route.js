import { profileSocialList } from "@/lib/profile-social-api";
import { mobileOptions } from "@/lib/mobile-api";
export const OPTIONS = mobileOptions;
export function GET(request, { params }) { return profileSocialList(request, params, "visitors"); }
