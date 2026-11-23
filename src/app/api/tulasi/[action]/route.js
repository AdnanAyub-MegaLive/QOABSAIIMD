import { handleCallback } from "@/lib/tulasi/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-to-server callbacks from the Tulasi game platform.
// Register https://<domain>/api/tulasi/ as the Callback URL in the Tulasi admin panel.
export async function POST(request, { params }) {
  const { action } = await params;
  const { status, body } = await handleCallback(action, await request.text());
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
