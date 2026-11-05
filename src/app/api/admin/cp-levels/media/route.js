import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/portal-admin';
import { sameOrigin } from '@/lib/game-control/http';
import { readUploadForm } from '@/lib/upload-form';
import { validateSvga } from '@/lib/svga-upload';
import { isRateLimited } from '@/lib/rate-limit';
import { requestOrigin } from '@/lib/user-perks';
const fail = (message, status = 422) => Object.assign(new Error(message), { status });
export async function POST(request) {
  try {
    const admin = await requirePermission('cp.edit'); sameOrigin(request);
    if (isRateLimited(`cp-media:${admin.id}`, { limit: 20, windowMs: 60000 })) throw fail('Please wait before uploading more files.', 429);
    const form = await readUploadForm(request, 16 * 1024 * 1024);
    const file = form.get('file'), purpose = form.get('purpose');
    if (!['image', 'animation'].includes(purpose) || !(file instanceof File)) throw fail('Choose a media file.');
    if (!file.size || file.size > 15 * 1024 * 1024) throw fail('Files must be between 1 byte and 15 MB.', 413);
    let bytes = Buffer.from(await file.arrayBuffer()), mimeType;
    if (purpose === 'animation') {
      if (file.name.toLowerCase().endsWith('.svga')) { await validateSvga(bytes); mimeType = 'application/svga'; }
      else { mimeType = (await fileTypeFromBuffer(bytes))?.mime; if (mimeType !== 'video/mp4') throw fail('Upload an SVGA or MP4 animation.'); }
    } else {
      try {
        const image = sharp(bytes, { animated: true, limitInputPixels: 16000000 });
        const meta = await image.metadata();
        if (!['png','jpeg','webp','gif'].includes(meta.format) || (meta.pages ?? 1) > 100) throw Error();
        bytes = await image.resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).webp().toBuffer();
        mimeType = 'image/webp';
        if (bytes.length > 15 * 1024 * 1024) throw Error();
      } catch { throw fail('Upload a valid PNG, JPEG, WebP or GIF image, up to 100 frames.'); }
    }
    const asset = await prisma.$transaction(async tx => {
      const asset = await tx.uploadAsset.create({ data: { publicId: `AST-${randomUUID()}`, name: `CP ${purpose}: ${file.name}`.slice(0,100), category: 'CP_MEDIA', fileName: purpose === 'image' ? 'cp-image.webp' : mimeType === 'video/mp4' ? 'cp-animation.mp4' : 'cp-animation.svga', mimeType, fileSize: bytes.length, fileData: bytes, active: true, storeVisible: false, distribution: 'MANUAL' } });
      await tx.auditLog.create({ data: { adminId: admin.id, action: 'CP_MEDIA_UPLOADED', category: 'CONTENT_MANAGEMENT', entityType: 'UploadAsset', entityId: asset.publicId, description: 'Uploaded CP level artwork.' } });
      return asset;
    });
    return Response.json({ success: true, data: { url: `${requestOrigin(request)}/api/cp-media/${asset.publicId}`, mimeType } });
  } catch (error) { return Response.json({ success: false, error: { message: error.status ? error.message : 'Unable to upload CP media.' } }, { status: error.status ?? 500 }); }
}
