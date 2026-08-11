import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signOut } from "../../../auth";
import { calculateRankings } from "../../lib/ranking-service";
import { rankingPeriods, rankingTypes } from "../../lib/rankings";
import FeatureSearch from "../components/feature-search";
import PortalSidebar from "../components/portal-sidebar";
import RankingsView from "./rankings-view";

const pageSize = 25;

export default async function RankingsPage({ searchParams }) {
  const session = await auth();
  if (!session?.user) redirect("/");
  const params = await searchParams;
  const requestedType = String(params?.type ?? "overall");
  const requestedPeriod = String(params?.period ?? "week");
  const type = rankingTypes.has(requestedType) ? requestedType : "overall";
  const period = rankingPeriods.has(requestedPeriod) ? requestedPeriod : "week";
  const requestedPage = Number.parseInt(String(params?.page ?? "1"), 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host")?.split(",")[0]?.trim() || headerStore.get("host") || "localhost:3000";
  const protocol = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  const origin = (process.env.MOBILE_API_BASE_URL || `${protocol}://${host}`).replace(/\/$/, "");
  const result = await calculateRankings({
    type,
    period,
    origin,
    offset: (page - 1) * pageSize,
    limit: pageSize,
    includeDetails: true,
  });
  const totalPages = Math.max(1, Math.ceil(Math.max(0, result.totalRanked - 3) / pageSize));
  if (page > totalPages)
    redirect(`/rankings?type=${encodeURIComponent(type)}&period=${encodeURIComponent(period)}&page=${totalPages}`);

  return (
    <main className="min-h-screen bg-[#f4f8f7] text-[#142c2a]">
      <PortalSidebar />
      <section className="lg:pl-64">
        <header className="flex h-20 items-center gap-6 border-b border-[#dfe9e7] bg-white px-6 md:px-10">
          <div className="shrink-0">
            <p className="text-xs font-semibold tracking-widest text-[#16877d] uppercase">Insights</p>
            <h1 className="text-xl font-bold">Rankings</h1>
          </div>
          <FeatureSearch />
          <div className="ml-auto hidden text-right sm:block">
            <p className="text-sm font-semibold">{session.user.name}</p>
            <p className="text-xs text-[#718580]">{session.user.email}</p>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="rounded-lg border border-[#d7e4e1] px-4 py-2 text-xs font-semibold">Sign out</button>
          </form>
        </header>
        <div className="mx-auto max-w-7xl p-6 md:p-10">
          <div className="mb-7">
            <h2 className="text-2xl font-bold">Mobile leaderboard control</h2>
            <p className="mt-1.5 text-sm text-[#71847f]">
              The same authoritative scores, identities, and asset rules returned to the mobile application.
            </p>
          </div>
          <RankingsView
            type={type}
            period={period}
            generatedAt={result.generatedAt}
            podium={result.podium}
            rankings={result.rankings}
            totalRanked={result.totalRanked}
            page={page}
            totalPages={totalPages}
          />
        </div>
      </section>
    </main>
  );
}
