import { requireMobileUser, mobileApiError } from "@/lib/mobile-api";
import { requestOrigin } from "@/lib/user-perks";
import { withV1Request, v1Options } from "@/lib/mobile-v1";
import { cachedAssetManifest, etagMatches } from "@/lib/asset-manifest";

const path = "/api/v1/assets/manifest", methods = "GET, OPTIONS";
const appVersionPattern = /^\d{1,4}(\.\d{1,4}){0,3}$/;

export function OPTIONS(request) { return v1Options(request, methods); }

export async function GET(request) {
  const response = await withV1Request(request, { path, methods, rateLimit: { limit: 30, windowMs: 60000 } }, async () => {
    try {
      await requireMobileUser(request);
      const appVersion = new URL(request.url).searchParams.get("appVersion");
      if (appVersion && !appVersionPattern.test(appVersion))
        return Response.json({ success: false, error: { code: "INVALID_APP_VERSION", message: "appVersion must look like 2.0.4." } }, { status: 422 });
      const manifest = await cachedAssetManifest(requestOrigin(request));
      const etag = `"${manifest.manifestVersion}"`;
      const headers = { ETag: etag, "X-Manifest-Version": manifest.manifestVersion };
      if (etagMatches(request.headers.get("if-none-match"), manifest.manifestVersion))
        return new Response(null, { status: 304, headers });
      return Response.json({ success: true, data: { ...manifest, appVersion: appVersion ?? null } }, { headers });
    } catch (error) {
      return mobileApiError(error, "ASSET_MANIFEST_FAILED");
    }
  });
  if (!response.headers.get("ETag")) return response;
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-cache");
  return new Response(response.body, { status: response.status, headers });
}
