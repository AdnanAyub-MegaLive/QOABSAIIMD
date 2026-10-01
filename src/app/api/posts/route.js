import { prisma } from "@/lib/prisma";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "@/lib/mobile-api";
import { requestOrigin, resolveUserPerks } from "@/lib/user-perks";

const pageSize = 20;
const maxImageSize = 10 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function OPTIONS() {
  return mobileOptions();
}

function validation(message, fields) {
  return mobileJson(
    {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message,
        ...(fields ? { fields } : {}),
      },
    },
    400,
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

export async function GET(request) {
  try {
    const viewer = await requireMobileUser(request);
    const cursor = new URL(request.url).searchParams.get("cursor")?.trim() || null;
    if (cursor) {
      const exists = await prisma.post.findUnique({ where: { publicId: cursor }, select: { id: true } });
      if (!exists) return validation("The post cursor is invalid.", { cursor: "Post not found." });
    }
    const records = await prisma.post.findMany({
      ...(cursor ? { cursor: { publicId: cursor }, skip: 1 } : {}),
      select: {
        _count: { select: { likes: true, comments: { where: { deletedAt: null } } } },
        likes: { where: { userId: viewer.id }, select: { userId: true } },
        publicId: true,
        description: true,
        imageUrl: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            publicId: true,
            name: true,
            profileImage: true,
            isOfficial: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
    });
    const hasMore = records.length > pageSize;
    const page = records.slice(0, pageSize);
    const origin = requestOrigin(request);
    const perksByPublicId = await resolveUserPerks(
      page.map((post) => post.author),
      origin,
      ["FRAMES", "BADGES"],
    );
    return mobileJson({
      success: true,
      data: {
        posts: page.map((post) => ({
          id: post.publicId,
          likeCount: post._count.likes,
          commentCount: post._count.comments,
          liked: post.likes.length > 0,
          description: post.description,
          imageUrl: post.imageUrl ? new URL(post.imageUrl, origin).toString() : null,
          createdAt: post.createdAt.toISOString(),
          author: {
            publicId: post.author.publicId,
            fullName: post.author.name,
            profileImage: post.author.profileImage,
            isOfficial: Boolean(post.author.isOfficial),
            frameUrl:
              perksByPublicId.get(post.author.publicId)?.frameUrl ?? null,
            badgeUrl:
              perksByPublicId.get(post.author.publicId)?.badgeUrl ?? null,
          },
        })),
        nextCursor: hasMore ? page.at(-1)?.publicId ?? null : null,
      },
    });
  } catch (error) {
    console.error("Discover feed failed", error);
    return mobileApiError(error, "POST_FEED_FAILED");
  }
}

export async function POST(request) {
  try {
    const author = await requireMobileUser(request);
    let form;
    try {
      form = await request.formData();
    } catch {
      return validation("Request body must be multipart/form-data.");
    }
    const rawDescription = String(form.get("description") ?? "").trim();
    if (rawDescription.length > 5000)
      return validation("Description cannot exceed 5,000 characters.", { description: "Too long." });
    const description = rawDescription || null;
    const file = form.get("image");
    const hasImage = file instanceof File && file.size > 0;
    if (!description && !hasImage)
      return validation("A post needs a description or an image.");
    if (hasImage && !allowedImageTypes.has(file.type))
      return validation("Image must be a JPEG, PNG, or WebP file.", { image: "Unsupported image type." });
    if (hasImage && file.size > maxImageSize)
      return mobileJson({ success: false, error: { code: "FILE_TOO_LARGE", message: "Post images cannot exceed 10 MB." } }, 413);
    const imageData = hasImage ? Buffer.from(await file.arrayBuffer()) : null;
    if (imageData && !validImageSignature(imageData, file.type))
      return validation("Image content does not match its file type.", { image: "Invalid image file." });

    const publicId = `PST-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const created = await prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          publicId,
          authorId: author.id,
          description,
          imageUrl: imageData ? `/api/posts/${publicId}/image` : null,
          imageData,
          imageMime: imageData ? file.type : null,
        },
        select: { publicId: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          action: "DISCOVER_POST_CREATED",
          category: "CONTENT_MANAGEMENT",
          entityType: "Post",
          entityId: post.publicId,
          description: `User ${author.publicId} created a Discover post.`,
          metadata: { userId: author.publicId, hasDescription: Boolean(description), hasImage: Boolean(imageData) },
        },
      });
      return post;
    });
    return mobileJson({ success: true, data: { id: created.publicId, createdAt: created.createdAt.toISOString() } }, 201);
  } catch (error) {
    console.error("Discover post creation failed", error);
    return mobileApiError(error, "POST_CREATE_FAILED");
  }
}
