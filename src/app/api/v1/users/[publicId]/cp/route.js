import { prisma } from '@/lib/prisma';
import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from '@/lib/mobile-api';
import { requestOrigin } from '@/lib/user-perks';
import { userCp } from '@/lib/cp-profile';
export const OPTIONS = mobileOptions;
export async function GET(request, context) {
  try {
    const viewer = await requireMobileUser(request);
    const { publicId } = await context.params;
    const target = await prisma.user.findFirst({ where: { publicId, status: 'ACTIVE', deletedAt: null,
      bans: { none: { target: 'USER', revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } },
      select: { id: true, publicId: true, name: true, profileImage: true } });
    const cp = target ? await userCp(prisma, target, viewer, requestOrigin(request)) : null;
    const response = await mobileJson({ success: true, data: { cp } });
    response.headers.set('Cache-Control','private, no-store');
    return response;
  } catch (error) { return mobileApiError(error, 'CP_PROFILE_FAILED'); }
}
