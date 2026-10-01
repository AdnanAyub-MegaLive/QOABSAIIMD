import { prisma } from "@/lib/prisma";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "@/lib/mobile-api";
import { requestOrigin } from "@/lib/user-perks";

const maxImageSize = 10 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function OPTIONS() {
  return mobileOptions();
}

function responseError(code, message, status, fields) {
  return mobileJson(
    { success: false, error: { code, message, ...(fields ? { fields } : {}) } },
    status,
  );
}

function validImageSignature(bytes, mime) {
  if (mime === "image/jpeg")
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png")
    return bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === "image/webp")
    return bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP";
  return false;
}

export async function PATCH(request, { params }) {
  try {
    const user = await requireMobileUser(request);
    const { postId } = await params;
    const post = await prisma.post.findUnique({
      where: { publicId: decodeURIComponent(postId) },
      select: { id: true, publicId: true, authorId: true, description: true, imageUrl: true },
    });
    if (!post) return responseError("POST_NOT_FOUND", "Post not found.", 404);
    if (post.authorId !== user.id)
      return responseError("FORBIDDEN", "You can only edit your own posts.", 403);

    let form;
    try {
      form = await request.formData();
    } catch {
      return responseError("VALIDATION_ERROR", "Request body must be multipart/form-data.", 400);
    }
    const updatesDescription = form.has("description");
    const description = updatesDescription
      ? String(form.get("description") ?? "").trim() || null
      : post.description;
    if (description && description.length > 5000)
      return responseError("VALIDATION_ERROR", "Description cannot exceed 5,000 characters.", 400, { description: "Too long." });
    const removeImage = String(form.get("removeImage") ?? "").toLowerCase() === "true";
    const file = form.get("image");
    const hasReplacement = file instanceof File && file.size > 0;
    if (removeImage && hasReplacement)
      return responseError("VALIDATION_ERROR", "Choose either a replacement image or removeImage, not both.", 400);
    if (hasReplacement && !allowedImageTypes.has(file.type))
      return responseError("VALIDATION_ERROR", "Image must be a JPEG, PNG, or WebP file.", 400, { image: "Unsupported image type." });
    if (hasReplacement && file.size > maxImageSize)
      return responseError("FILE_TOO_LARGE", "Post images cannot exceed 10 MB.", 413);
    const imageData = hasReplacement ? Buffer.from(await file.arrayBuffer()) : null;
    if (imageData && !validImageSignature(imageData, file.type))
      return responseError("VALIDATION_ERROR", "Image content does not match its file type.", 400, { image: "Invalid image file." });
    const resultingHasImage = hasReplacement || (!removeImage && Boolean(post.imageUrl));
    if (!description && !resultingHasImage)
      return responseError("VALIDATION_ERROR", "A post needs a description or an image.", 400);

    const version = Date.now();
    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.post.update({
        where: { id: post.id },
        data: {
          ...(updatesDescription ? { description } : {}),
          ...(hasReplacement
            ? {
                imageData,
                imageMime: file.type,
                imageUrl: `/api/posts/${post.publicId}/image?v=${version}`,
              }
            : removeImage
              ? { imageData: null, imageMime: null, imageUrl: null }
              : {}),
        },
        select: { publicId: true, description: true, imageUrl: true, updatedAt: true },
      });
      await tx.auditLog.create({
        data: {
          action: "DISCOVER_POST_UPDATED",
          category: "CONTENT_MANAGEMENT",
          entityType: "Post",
          entityId: post.publicId,
          description: `User ${user.publicId} updated a Discover post.`,
          metadata: {
            userId: user.publicId,
            descriptionChanged: updatesDescription,
            imageReplaced: hasReplacement,
            imageRemoved: removeImage,
          },
        },
      });
      return changed;
    });
    return mobileJson({
      success: true,
      data: {
        id: updated.publicId,
        description: updated.description,
        imageUrl: updated.imageUrl
          ? new URL(updated.imageUrl, requestOrigin(request)).toString()
          : null,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Discover post update failed", error);
    return mobileApiError(error, "POST_UPDATE_FAILED");
  }
}

export async function DELETE(request, { params }) {
  try {
    const user = await requireMobileUser(request);
    const { postId } = await params;
    const post = await prisma.post.findUnique({
      where: { publicId: decodeURIComponent(postId) },
      select: { id: true, publicId: true, authorId: true },
    });
    if (!post) return responseError("POST_NOT_FOUND", "Post not found.", 404);
    if (post.authorId !== user.id)
      return responseError("FORBIDDEN", "You can only delete your own posts.", 403);
    await prisma.$transaction(async (tx) => {
      await tx.post.delete({ where: { id: post.id } });
      await tx.auditLog.create({
        data: {
          action: "DISCOVER_POST_DELETED",
          category: "CONTENT_MANAGEMENT",
          entityType: "Post",
          entityId: post.publicId,
          description: `User ${user.publicId} deleted a Discover post.`,
          metadata: { userId: user.publicId },
        },
      });
    });
    return mobileJson({ success: true, data: { id: post.publicId } });
  } catch (error) {
    console.error("Discover post deletion failed", error);
    return mobileApiError(error, "POST_DELETE_FAILED");
  }
}
