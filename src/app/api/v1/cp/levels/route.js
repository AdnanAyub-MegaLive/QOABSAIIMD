import { prisma } from '@/lib/prisma';
import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from '@/lib/mobile-api';
import { cpLevelDto } from '@/lib/cp-levels';
export const OPTIONS = mobileOptions;
export async function GET(request) {
  try {
    await requireMobileUser(request);
    const levels = await prisma.cpLevel.findMany({ where: { enabled: true }, orderBy: { level: 'asc' } });
    const response = await mobileJson({ success: true, data: { levels: levels.map(cpLevelDto) } });
    response.headers.set('Cache-Control','private, no-store');
    return response;
  } catch (error) { return mobileApiError(error, 'CP_LEVELS_FAILED'); }
}
