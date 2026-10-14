import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { sameOrigin, jsonBody } from "@/lib/game-control/http";
import { validateProhibitedWords } from "@/lib/chat-word-policy";

function failure(error) {
  const status = error.status || (error.code === "P2002" ? 409 : 500);
  if (status === 500) console.error("Chat word policy failed", error);
  return Response.json({ success: false, error: { code: status === 409 ? "POLICY_CONFLICT" : error.status ? error.code || "VALIDATION_ERROR" : "POLICY_FAILED", message: status === 500 ? "Unable to save prohibited words." : status === 409 ? "Settings changed. Reload before saving." : error.message } }, { status });
}
export async function GET() {
  try {
    await requirePermission("rules.view");
    const policy = await prisma.chatWordPolicy.findUnique({ where: { id: "GLOBAL" } });
    return Response.json({ success: true, data: policy ?? { words: [], revision: 0 } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function PUT(request) {
  try {
    const admin = await requirePermission("rules.manage");
    sameOrigin(request);
    const input = await jsonBody(request);
    const words = validateProhibitedWords(input.words);
    if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw Object.assign(new Error("A valid policy revision is required."), { status: 422 });
    const data = await prisma.$transaction(async tx => {
      await tx.chatWordPolicy.upsert({ where: { id: "GLOBAL" }, create: { id: "GLOBAL" }, update: {} });
      const saved = await tx.chatWordPolicy.updateMany({ where: { id: "GLOBAL", revision: input.revision }, data: { words, revision: { increment: 1 } } });
      if (!saved.count) throw Object.assign(new Error("Settings changed. Reload before saving."), { status: 409 });
      await tx.auditLog.create({ data: { adminId: admin.id, action: "CHAT_WORD_POLICY_UPDATED", category: "CONTENT_MODERATION", entityType: "ChatWordPolicy", entityId: "GLOBAL", description: `Updated prohibited chat words (${words.length} entries).`, metadata: { revision: input.revision + 1, count: words.length } } });
      return { words, revision: input.revision + 1 };
    });
    return Response.json({ success: true, data });
  } catch (error) { return failure(error); }
}
