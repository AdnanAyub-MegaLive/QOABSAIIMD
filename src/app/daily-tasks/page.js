import RoomManagementShell from "../components/room-management-shell";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";
import DailyTasksManager from "./daily-tasks-manager";
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
    <RoomManagementShell title="Daily Tasks">
          <div className="mb-7"><h2 className="text-2xl font-bold">Task catalogue</h2><p className="mt-1.5 text-sm text-[#71847f]">Control the mobile task tabs, rewards, targets and campaign placement. Changes affect newly created periods and unclaimed task displays.</p></div>
          <DailyTasksManager initialCategories={categoryData} initialTasks={taskData} />
        </RoomManagementShell>
  );
}
