import { requirePagePermission } from "@/lib/portal-admin";
import { redirect } from "next/navigation";
import { auth, signOut } from "../../../auth";
import { prisma } from "../../lib/prisma";
import FeatureSearch from "../components/feature-search";
import AuditLogTable from "./audit-log-table";
import PortalSidebar from "../components/portal-sidebar";

const pageSize = 50;

export default async function AuditLogsPage({ searchParams }) {
  await requirePagePermission("audit.view");
  const session = await auth();
  if (!session?.user) redirect("/");
  const params = await searchParams;
  const query = String(params?.q ?? "").trim().slice(0, 200);
  const requestedCategory = String(params?.category ?? "All").trim();
  const category = requestedCategory === "All" ? "All" : requestedCategory;
  const requestedPage = Number.parseInt(String(params?.page ?? "1"), 10);
  const currentPage = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;
  const where = {
    ...(category !== "All" ? { category } : {}),
    ...(query
      ? {
          OR: [
            { action: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
            { entityId: { contains: query, mode: "insensitive" } },
            { admin: { is: { name: { contains: query, mode: "insensitive" } } } },
            { admin: { is: { email: { contains: query, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const [filteredTotal, totalRecords, totalToday, securityCount] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.count(),
    prisma.auditLog.count({
      where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
    prisma.auditLog.count({ where: { category: "SECURITY" } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));
  const page = Math.min(currentPage, totalPages);
  const records = await prisma.auditLog.findMany({
      where,
      include: { admin: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  const logs = records.map((log) => ({
    id: log.id,
    createdAt: log.createdAt.toLocaleString("en-US"),
    adminName: log.admin?.name ?? "System",
    adminEmail: log.admin?.email ?? "Automated process",
    category: log.category,
    action: log.action,
    entityId: log.entityId,
    description: log.description
      .replace(/\btalents\b/gi, "hosts")
      .replace(/\btalent\b/gi, "host"),
    reason:
      log.metadata &&
      typeof log.metadata === "object" &&
      !Array.isArray(log.metadata)
        ? (log.metadata.reason ?? null)
        : null,
  }));
  return (
    <main className="min-h-screen bg-[#f4f8f7] text-[#142c2a]">
      <PortalSidebar />
      <section className="lg:pl-64">
        <header className="flex h-20 items-center gap-6 border-b border-[#dfe9e7] bg-white px-6 md:px-10">
          <div className="shrink-0">
            <p className="text-xs font-semibold tracking-widest text-[#16877d] uppercase">
              System
            </p>
            <h1 className="text-xl font-bold">Audit Logs</h1>
          </div>
          <FeatureSearch />
          <div className="ml-auto">
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button className="rounded-lg border border-[#d7e4e1] px-4 py-2 text-xs font-semibold">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <div className="mx-auto max-w-7xl p-6 md:p-10">
          <div className="mb-7">
            <h2 className="text-2xl font-bold">Portal activity history</h2>
            <p className="mt-1.5 text-sm text-[#71847f]">
              A permanent record of administrative and system activity.
            </p>
          </div>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            {[
              ["Total records", totalRecords, "Complete audit history"],
              ["Activity today", totalToday, "Actions since midnight"],
              ["Security events", securityCount, "Bans and restrictions"],
            ].map(([label, value, note]) => (
              <div
                key={label}
                className="rounded-xl border border-[#dfe9e7] bg-white p-5"
              >
                <p className="text-[11px] font-semibold text-[#768984]">
                  {label}
                </p>
                <p className="mt-2 text-2xl font-bold">{value}</p>
                <p className="mt-2 text-[10px] text-[#429387]">{note}</p>
              </div>
            ))}
          </div>
          <AuditLogTable
            logs={logs}
            query={query}
            category={category}
            page={page}
            pageSize={pageSize}
            total={filteredTotal}
            totalPages={totalPages}
          />
        </div>
      </section>
    </main>
  );
}
