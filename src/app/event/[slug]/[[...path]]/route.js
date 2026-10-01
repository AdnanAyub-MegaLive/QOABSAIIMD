import { prisma } from "../../../../lib/prisma.js";
import { resolvePublishedFile } from "../../../../lib/events/storage.js";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

function unavailable() {
  if (process.env.EVENTS_UNPUBLISHED_MODE === "maintenance")
    return new Response(
      "<!doctype html><html><body style='font-family:sans-serif;text-align:center;padding:10vh 2rem'><h1>Event unavailable</h1><p>This event is not currently published.</p></body></html>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    );
  return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request, { params }) {
  try {
    const values = await params;
    const event = await prisma.event.findFirst({
      where: { slug: values.slug, status: "PUBLISHED" },
    });
    if (!event) return unavailable();
    const version = await prisma.eventVersion.findUnique({
      where: { eventId_version: { eventId: event.id, version: event.version } },
    });
    if (!version) return unavailable();
    const requested = values.path?.length ? values.path.join("/") : version.entryFile;
    const file = await resolvePublishedFile(version.folderName, requested);
    const isHtml = file.extension === ".html";
    const range = request.headers.get("range");
    let body = file.buffer;
    let status = 200;
    const responseHeaders = {};
    if (range && /^bytes=\d*-\d*$/.test(range)) {
      const [startText, endText] = range.slice(6).split("-");
      const start = startText ? Number(startText) : 0;
      const end = endText ? Math.min(Number(endText), file.details.size - 1) : file.details.size - 1;
      if (Number.isInteger(start) && Number.isInteger(end) && start <= end && start < file.details.size) {
        body = file.buffer.subarray(start, end + 1);
        status = 206;
        responseHeaders["Content-Range"] = `bytes ${start}-${end}/${file.details.size}`;
      }
    }
    return new Response(body, {
      status,
      headers: {
        "Content-Type": contentTypes[file.extension] || "application/octet-stream",
        "Content-Length": String(body.byteLength),
        "Accept-Ranges": "bytes",
        "Cache-Control": isHtml ? "no-cache, no-store, must-revalidate" : "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; font-src 'self' data:; connect-src 'self' https: wss:; frame-ancestors *",
        ...responseHeaders,
      },
    });
  } catch {
    return unavailable();
  }
}

export async function HEAD(request, context) {
  const response = await GET(request, context);
  return new Response(null, { status: response.status, headers: response.headers });
}
