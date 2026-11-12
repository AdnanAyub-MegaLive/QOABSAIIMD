import { prisma } from "@/lib/prisma";
import { helpLanguage, helpResponse, publicHelp } from "@/lib/help-center";
import { requestOrigin } from "@/lib/user-perks";
export const dynamic = "force-dynamic";
export async function GET(request) {
  const parsed = helpLanguage.safeParse((new URL(request.url).searchParams.get("lang") || "en").toLowerCase());
  if (!parsed.success) return Response.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid language code." } }, { status: 422 });
  const [entries, settings] = await Promise.all([
    prisma.helpEntry.findMany({ where: { published: true, language: { in: [...new Set(["en", parsed.data])] } } }),
    prisma.helpSettings.findUnique({ where: { id: "GLOBAL" } }),
  ]);
  return helpResponse(publicHelp(entries, settings, parsed.data, requestOrigin(request)), request.headers.get("if-none-match"));
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Authorization, If-None-Match", "Access-Control-Max-Age": "300" } });
}
