import { auditRow } from "./audit-view.js";

// Bounded reads; no writes or long-lived transaction while a download is open.
export async function auditExport(db, where, signal, snapshot = new Date()) {
  const encoder = new TextEncoder();
  let after = {}, first = true, opened = false, cancelled = false;
  const read = () => db.auditLog.findMany({ where: { AND: [where, { createdAt: { lte: snapshot } }, after] }, include: { admin: { select: { name: true, email: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 500 });
  // Catch initial database failures before sending a successful response.
  let batch = await read();
  return new ReadableStream({
    async pull(controller) {
      if (cancelled || signal?.aborted) { controller.close(); return; }
      try {
        if (!opened) { controller.enqueue(encoder.encode('{"success":true,"data":{"items":[')); opened = true; }
        const rows = batch ?? await read(); batch = null;
        if (cancelled || signal?.aborted) { controller.close(); return; }
        if (rows.length) {
          controller.enqueue(encoder.encode((first ? "" : ",") + rows.map(row => JSON.stringify(auditRow(row))).join(",")));
          first = false;
          const last = rows.at(-1);
          after = { OR: [{ createdAt: { lt: last.createdAt } }, { createdAt: last.createdAt, id: { lt: last.id } }] };
        }
        if (rows.length < 500) {
          controller.enqueue(encoder.encode(`],"truncated":false,"snapshotAt":${JSON.stringify(snapshot.toISOString())}}}`));
          controller.close();
        }
      } catch (error) { if (!cancelled) controller.error(error); }
    },
    cancel() { cancelled = true; },
  });
}
