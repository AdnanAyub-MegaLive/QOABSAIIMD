import { authenticatePartner, findPartnerKeyByPublicId, logPartnerCall, partnerErrorResponse, PartnerApiError, rateLimitPartner } from "./partner-auth.js";
import { catalogEtag, etagMatches, loadItem, loadItemPage, loadRemovedPage, mallItemWhere, needsFullSync, parseListQuery, partnerBase, partnerItem, partnerJson, partnerMediaExpiry } from "./partner-catalog.js";
import { corsOrigin, originAllowed, partnerMediaKinds, verifyPartnerMediaSignature } from "./partner-media-sign.js";
import { ensurePreview, hasMotionSource } from "./partner-previews.js";

async function run(db, request, task) {
  let key = null;
  try {
    key = await authenticatePartner(db, request);
    const response = await task(key);
    logPartnerCall(key, request, response.status);
    return response;
  } catch (error) {
    const response = partnerErrorResponse(error);
    logPartnerCall(key, request, response.status);
    return response;
  }
}

export function createPartnerHandlers(db) {
  return {
    async listItems(request) {
      return run(db, request, async (key) => {
        const query = parseListQuery(new URL(request.url).searchParams);
        const page = await loadItemPage(db, query);
        const fullSyncRequired = Boolean(query.updatedSince && needsFullSync(query.updatedSince));
        const wantsRemoved = query.updatedSince && !fullSyncRequired && (!query.cursor || query.removedCursor);
        const removed = wantsRemoved ? await loadRemovedPage(db, query.updatedSince, query.removedCursor) : null;
        const base = partnerBase(request);
        const exp = partnerMediaExpiry();
        const etag = catalogEtag(page.rows, `${base}|${page.nextCursor}|${fullSyncRequired}|${removed ? `${removed.removed.join(",")}|${removed.removedCursor}` : ""}`, key, exp);
        if (etagMatches(request, etag)) return partnerJson(null, etag, 304);
        const data = { items: page.rows.map((row) => partnerItem(row, base, key, exp)), nextCursor: page.nextCursor };
        if (fullSyncRequired) data.fullSyncRequired = true;
        if (removed) Object.assign(data, removed);
        return partnerJson({ success: true, data }, etag);
      });
    },
    async getItem(request, id) {
      return run(db, request, async (key) => {
        const publicId = String(id ?? "").trim();
        const row = publicId && publicId.length <= 64 ? await loadItem(db, publicId) : null;
        if (!row) throw new PartnerApiError("NOT_FOUND", "Item not found.", 404);
        const base = partnerBase(request);
        const exp = partnerMediaExpiry();
        const etag = catalogEtag([row], `item|${base}`, key, exp);
        if (etagMatches(request, etag)) return partnerJson(null, etag, 304);
        return partnerJson({ success: true, data: partnerItem(row, base, key, exp) }, etag);
      });
    },
    async media(request, id, kind) {
      let key = null;
      try {
        const params = Object.fromEntries(new URL(request.url).searchParams);
        if (!verifyPartnerMediaSignature(id, kind, params)) throw new PartnerApiError("INVALID_SIGNATURE", "Media link is invalid or expired.", 403);
        key = await findPartnerKeyByPublicId(db, params.key);
        if (!key) throw new PartnerApiError("INVALID_SIGNATURE", "Media link is invalid or expired.", 403);
        if (!originAllowed(key.allowedOrigins, request)) throw new PartnerApiError("ORIGIN_NOT_ALLOWED", "This website is not allowed to load partner media.", 403);
        await rateLimitPartner(`partner-media:${key.id}`, 600);
        const asset = await db.uploadAsset.findFirst({ where: { ...mallItemWhere, publicId: id }, select: { id: true, publicId: true, mimeType: true, mediaVersion: true, posterMediaVersion: true } });
        if (!asset) throw new PartnerApiError("NOT_FOUND", "Media not found.", 404);
        const previewKind = partnerMediaKinds[kind];
        if (previewKind === "MOTION" && !hasMotionSource(asset)) throw new PartnerApiError("NOT_FOUND", "Media not found.", 404);
        const preview = await ensurePreview(db, asset, previewKind);
        if (!preview?.data) throw new PartnerApiError("NOT_FOUND", "Preview is not available.", 404);
        logPartnerCall(key, request, 200);
        const allowOrigin = corsOrigin(key.allowedOrigins, request);
        return new Response(preview.data, { status: 200, headers: {
          ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin } : {}),
          "Content-Type": preview.mimeType, "Content-Length": String(preview.size ?? preview.data.length),
          "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline",
          "Cross-Origin-Resource-Policy": "cross-origin", Vary: "Origin, Referer",
        } });
      } catch (error) {
        const response = partnerErrorResponse(error);
        logPartnerCall(key, request, response.status);
        return response;
      }
    },
  };
}

