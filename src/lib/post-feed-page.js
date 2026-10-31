import { reviewPage } from "./review-pagination.js";

export async function postFeedPage(db, viewerId, cursor) {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor?.startsWith("feed:")) params.set("cursor", cursor.slice(5));
  const page = reviewPage(params, `discover:${viewerId}`, "createdAt", "desc", "publicId");
  if (cursor && !cursor.startsWith("feed:")) {
    const previous = await db.post.findUnique({ where: { publicId: cursor }, select: { publicId: true, createdAt: true } });
    if (previous) page.after = { OR: [{ createdAt: { lt: previous.createdAt } }, { createdAt: previous.createdAt, publicId: { lt: previous.publicId } }] };
  }
  return {
    ...page,
    result(rows) {
      const result = page.result(rows);
      return { ...result, nextCursor: result.nextCursor ? `feed:${result.nextCursor}` : null };
    },
  };
}
