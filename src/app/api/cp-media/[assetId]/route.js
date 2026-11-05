import { prisma } from '@/lib/prisma';
import { createPublicDisplayAssetUrl } from '@/lib/upload-assets';
import { requestOrigin } from '@/lib/user-perks';
// Stable reference; generate a fresh signed media URL on every access.
export async function GET(request, { params }) {
  const { assetId } = await params;
  const asset = await prisma.uploadAsset.findFirst({ where: { publicId: assetId, category: 'CP_MEDIA', active: true }, select: { publicId: true, mediaVersion: true, mimeType: true } });
  if (!asset) return new Response(null, { status: 404 });
  return new Response(null, { status: 307, headers: { Location: createPublicDisplayAssetUrl(requestOrigin(request), asset), 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
}
