import { requirePagePermission } from "@/lib/portal-admin";
import RoomManagementShell from "../components/room-management-shell";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";
import DailyTasksManager from "./daily-tasks-manager";
import NewUserRewardsManager from "./new-user-rewards-manager";
import { equippablePropCategories } from '@/lib/props-store';
export default async function DailyTasksPage() {
  await requirePagePermission("tasks.view");
  const session = await auth();
  if (!session?.user) redirect("/");
  const [categories, tasks, assets, tiers] = await Promise.all([
    prisma.dailyTaskCategory.findMany({
      include: { _count: { select: { definitions: { where: { deletedAt: null } } } } },
      orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
    }),
    prisma.dailyTaskDefinition.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { instances: true } } },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    }),
    prisma.uploadAsset.findMany({where:{active:true},select:{publicId:true,name:true,category:true},orderBy:{name:"asc"}}),
    prisma.vipTier.findMany({where:{active:true},select:{id:true,name:true,level:true},orderBy:{level:"asc"}}),
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
    metric: item.metric,
    config: item.config,
    rewardSpec: item.rewardSpec,
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
  const newUserPolicy = await prisma.newUserRewardPolicy.findFirst({ orderBy: { id: 'desc' } });
  return (
    <RoomManagementShell title="Daily Tasks">
          <div className="mb-7"><h2 className="text-2xl font-bold">Task catalogue</h2><p className="mt-1.5 text-sm text-[#71847f]">Control the mobile task tabs, rewards, targets and campaign placement. Changes affect newly created periods and unclaimed task displays.</p></div>
          {session.user.role === 'SUPER_ADMIN' && <NewUserRewardsManager initialPolicy={newUserPolicy ? { id: newUserPolicy.id, enabled: newUserPolicy.enabled, rewards: newUserPolicy.rewards } : null} assets={assets.filter(a => equippablePropCategories.has(a.category))} tiers={tiers} />}
          <DailyTasksManager initialCategories={categoryData} initialTasks={taskData} assets={assets} tiers={tiers} />
        </RoomManagementShell>
  );
}
