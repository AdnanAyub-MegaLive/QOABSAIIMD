import { prisma } from "@/lib/prisma";

export async function GET(_request, { params }) {
  const { postId } = await params;
  const post = await prisma.post.findUnique({
    where: { publicId: decodeURIComponent(postId) },
    select: { imageData: true, imageMime: true },
  });
  if (!post?.imageData || !post.imageMime)
    return Response.json(
      { success: false, error: { code: "IMAGE_NOT_FOUND", message: "Post image not found." } },
      { status: 404 },
    );
  return new Response(post.imageData, {
    headers: {
      "Content-Type": post.imageMime,
      "Content-Length": String(post.imageData.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": process.env.MOBILE_APP_ORIGIN || "*",
    },
  });
}
