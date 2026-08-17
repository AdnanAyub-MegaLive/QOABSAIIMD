import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { prisma } from "../../lib/prisma";
import FeatureSearch from "../components/feature-search";
import PortalSidebar from "../components/portal-sidebar";
import MessageHistoryTable from "./message-history-table";

const pageSize = 50;
const allowedTypes = new Set(["ALL", "WORLD", "DIRECT", "ROOM"]);

export default async function MessagesPage({ searchParams }) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const params = await searchParams;
  const query = String(params?.q ?? "").trim().slice(0, 200);
  const requestedType = String(params?.type ?? "ALL").toUpperCase();
  const type = allowedTypes.has(requestedType) ? requestedType : "ALL";
  const requestedPage = Number.parseInt(String(params?.page ?? "1"), 10);
  const currentPage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const filters = [Prisma.sql`1 = 1`];
  if (type !== "ALL") filters.push(Prisma.sql`"messageType" = ${type}`);
  if (query) {
    const pattern = `%${query}%`;
    filters.push(Prisma.sql`(
      "body" ILIKE ${pattern} OR
      "publicId" ILIKE ${pattern} OR
      COALESCE("senderPublicId", '') ILIKE ${pattern} OR
      COALESCE("senderName", '') ILIKE ${pattern} OR
      COALESCE("destinationId", '') ILIKE ${pattern} OR
      COALESCE("destinationName", '') ILIKE ${pattern}
    )`);
  }
  const whereSql = Prisma.join(filters, " AND ");
  const combinedSql = Prisma.sql`
    SELECT
      CASE WHEN c."kind" = 'WORLD' THEN 'WORLD' ELSE 'DIRECT' END AS "messageType",
      m."publicId",
      m."body",
      m."createdAt",
      u."publicId" AS "senderPublicId",
      u."name" AS "senderName",
      c."id" AS "conversationDbId",
      c."publicId" AS "destinationId",
      COALESCE(c."name", CASE WHEN c."kind" = 'WORLD' THEN 'World Chat' ELSE 'Private conversation' END) AS "destinationName"
    FROM "Message" m
    JOIN "Conversation" c ON c."id" = m."conversationId"
    LEFT JOIN "User" u ON u."id" = m."senderId"
    UNION ALL
    SELECT
      'ROOM' AS "messageType",
      arm."publicId",
      arm."body",
      arm."createdAt",
      arm."senderPublicId",
      arm."senderName",
      NULL AS "conversationDbId",
      arm."roomPublicId" AS "destinationId",
      arm."roomTitle" AS "destinationName"
    FROM "AudioRoomMessage" arm
  `;

  const [countRows, totalMessages, worldMessages, directMessages, roomMessages] = await Promise.all([
    prisma.$queryRaw(Prisma.sql`SELECT COUNT(*)::bigint AS "count" FROM (${combinedSql}) combined WHERE ${whereSql}`),
    prisma.message.count().then(async (conversationCount) => conversationCount + await prisma.audioRoomMessage.count()),
    prisma.message.count({ where: { conversation: { kind: "WORLD" } } }),
    prisma.message.count({ where: { conversation: { kind: "DIRECT" } } }),
    prisma.audioRoomMessage.count(),
  ]);
  const filteredTotal = Number(countRows[0]?.count ?? 0n);
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));
  const page = Math.min(currentPage, totalPages);
  const offset = (page - 1) * pageSize;
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT * FROM (${combinedSql}) combined
    WHERE ${whereSql}
    ORDER BY "createdAt" DESC, "publicId" DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `);
  const conversationIds = [...new Set(rows.map((row) => row.conversationDbId).filter(Boolean))];
  const conversations = conversationIds.length ? await prisma.conversation.findMany({
    where: { id: { in: conversationIds } },
    select: {
      id: true,
      participants: { select: { user: { select: { publicId: true, name: true } } } },
    },
  }) : [];
  const participantsByConversation = new Map(conversations.map((conversation) => [
    conversation.id,
    conversation.participants.map(({ user }) => ({ id: user.publicId, name: user.name })),
  ]));
  const records = rows.map((row) => ({
    id: row.publicId,
    type: row.messageType,
    body: row.body,
    createdAt: row.createdAt.toLocaleString("en-US"),
    senderId: row.senderPublicId,
    senderName: row.senderName ?? "Deleted user",
    destinationId: row.destinationId,
    destinationName: row.destinationName,
    participants: (participantsByConversation.get(row.conversationDbId) ?? []).filter((participant) => participant.id !== row.senderPublicId),
  }));

  return (
    <main className="min-h-screen bg-[#f4f8f7] text-[#142c2a]">
      <PortalSidebar />
      <section className="lg:pl-64">
        <header className="flex h-20 items-center gap-6 border-b border-[#dfe9e7] bg-white px-6 md:px-10">
          <div className="shrink-0">
            <p className="text-xs font-semibold tracking-widest text-[#16877d] uppercase">Communication</p>
            <h1 className="text-xl font-bold">Message History</h1>
          </div>
          <FeatureSearch />
        </header>
        <div className="mx-auto max-w-7xl p-6 md:p-10">
          <div className="mb-7">
            <h2 className="text-2xl font-bold">Platform message trace</h2>
            <p className="mt-1.5 text-sm text-[#71847f]">Search stored messages by sender, text, conversation, room name, room ID, or message ID.</p>
          </div>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[["All stored messages", totalMessages], ["World Chat", worldMessages], ["Private messages", directMessages], ["Audio-room messages", roomMessages]].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-[#dfe9e7] bg-white p-5">
                <p className="text-[11px] font-semibold text-[#768984]">{label}</p>
                <p className="mt-2 text-2xl font-bold">{value.toLocaleString("en-US")}</p>
              </div>
            ))}
          </div>
          <MessageHistoryTable records={records} query={query} type={type} page={page} pageSize={pageSize} total={filteredTotal} totalPages={totalPages} />
        </div>
      </section>
    </main>
  );
}
