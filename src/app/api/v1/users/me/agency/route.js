import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileCorsHeaders, mobileApiError } from "@/lib/mobile-api";
import { profileAgency } from "@/lib/profile-agency";
import { displayAssets } from "@/lib/public-profile";
import { requestOrigin } from "@/lib/user-perks";
import { profileSections } from "@/lib/profile-sections";

export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    const row = await prisma.user.findUnique({ where: { id: user.id }, select: { agency: true } });
    const agency = await profileAgency(prisma, user.id, row?.agency);
    const sections = profileSections();
    const assets = agency ? await sections.read(["logoUrl"], () => displayAssets([agency.logoAssetPublicId].filter(Boolean), requestOrigin(request)), new Map()) : new Map();
    return Response.json({ success: true, data: { publicId: user.publicId, agency: agency ? {
      publicId: agency.publicId, name: agency.name, status: agency.status,
      isOwner: agency.isOwner, ownerPublicId: agency.ownerPublicId,
      logoUrl: assets.get(agency.logoAssetPublicId)?.url ?? null,
    } : null } }, { headers: mobileCorsHeaders });
  } catch (error) { return mobileApiError(error, "PROFILE_AGENCY_FAILED"); }
}
