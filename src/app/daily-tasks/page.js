import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";
import FeatureSearch from "../components/feature-search";
import PortalSidebar from "../components/portal-sidebar";
import DailyTasksManager from "./daily-tasks-manager";
import RoomManagementTabs from "../components/room-management-tabs";

export default async function DailyTasksPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  const [categories, tasks] = await Promise.all([
    prisma.dailyTaskCategory.findMany({
      include: { _count: { select: { definitions: true } } },
      orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
    }),
    prisma.dailyTaskDefinition.findMany({
      include: { _count: { select: { instances: true } } },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    }),
  ]);
  const categoryData = categories.map((item) => ({
    key: item.key,
    icon: item.icon,
    sortOrder: item.sortOrder,
    active: item.active,
    taskCount: item._count.definitions,
  }));
  const taskData = tasks.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    description: item.description,
    rewardCoins: item.rewardCoins.toString(),
    targetValue: item.targetValue,
    unit: item.unit,
    cadence: item.cadence,
    categoryKey: item.categoryKey,
    icon: item.icon,
    iconUrl: item.iconUrl,
    featured: item.featured,
    topSupporter: item.topSupporter,
    sortOrder: item.sortOrder,
    active: item.active,
    instanceCount: item._count.instances,
  }));
  return (
    <main className="min-h-screen bg-[#f4f8f7] text-[#142c2a]">
      <PortalSidebar />
      <section className="lg:pl-64">
        <header className="flex h-20 items-center gap-6 border-b border-[#dfe9e7] bg-white px-6 md:px-10">
          <div className="shrink-0"><p className="text-xs font-semibold tracking-widest text-[#16877d] uppercase">Engagement</p><h1 className="text-xl font-bold">Daily Tasks</h1></div>
          <FeatureSearch />
        </header>
        <div className="mx-auto max-w-7xl p-6 md:p-10">
          <RoomManagementTabs />
          <div className="mb-7"><h2 className="text-2xl font-bold">Task catalogue</h2><p className="mt-1.5 text-sm text-[#71847f]">Control the mobile task tabs, rewards, targets and campaign placement. Changes affect newly created periods and unclaimed task displays.</p></div>
          <DailyTasksManager initialCategories={categoryData} initialTasks={taskData} />
        </div>
      </section>
    </main>
  );
}
