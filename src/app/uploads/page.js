import { requirePagePermission } from "@/lib/portal-admin";
import { redirect } from "next/navigation";
import { auth, signOut } from "../../../auth";
import FeatureSearch from "../components/feature-search";
import UploadTabs from "./upload-tabs";
import { prisma } from "../../lib/prisma";
import { serializeUploadAsset } from "../../lib/upload-assets";
import PortalSidebar from "../components/portal-sidebar";

export default async function UploadsPage() {
  await requirePagePermission("uploads.view");
  const session = await auth();
  if (!session?.user) redirect("/");
  const [assets, users] = await Promise.all([
    prisma.uploadAsset.findMany({
      where: { category: { not: "LIVE_GIFTS" } },
      select: {
        publicId: true,
        name: true,
        details: true,
        tags: true,
        category: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        posterFileData: true,
        posterMimeType: true,
        posterFileSize: true,
        actionUrl: true,
        placement: true,
        sortOrder: true,
        isGlobal: true,
        isRoomBackground: true,
        distribution: true,
        storeVisible: true,
        coinPrice: true,
        senderXp: true,
        receiverXp: true,
        giftTier: true,
        minimumVipLevel: true,
        minimumRecharge: true,
        defaultGrantDurationMinutes: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        assignments: {
          select: {
            assignedAt: true,
            durationMinutes: true,
            expiresAt: true,
            source: true,
            sourceReference: true,
            purchasePrice: true,
            user: {
              select: { publicId: true, name: true, profileImage: true },
            },
          },
          orderBy: { assignedAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { deletedAt: null },
      select: { publicId: true, name: true, phone: true },
      orderBy: { name: "asc" },
      take: 1000,
    }),
  ]);
  const uploadData = assets.map((asset) =>
    serializeUploadAsset(asset, `/api/uploads/${asset.publicId}/file`),
  );
  const userOptions = users.map((user) => ({
    id: user.publicId,
    name: user.name,
    phone: user.phone,
  }));

  return (
    <main className="min-h-screen bg-[#f4f8f7] text-[#142c2a]">
      <PortalSidebar />
      <section className="lg:pl-64">
        <header className="flex h-20 items-center gap-6 border-b border-[#dfe9e7] bg-white px-6 md:px-10">
          <div className="shrink-0">
            <p className="text-xs font-semibold tracking-widest text-[#16877d] uppercase">
              Content
            </p>
            <h1 className="text-xl font-bold">Uploads</h1>
          </div>
          <FeatureSearch />
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{session.user.name}</p>
              <p className="text-xs text-[#718580]">{session.user.email}</p>
            </div>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button className="rounded-lg border border-[#d7e4e1] px-4 py-2 text-xs font-semibold text-[#526b67] hover:bg-[#f1f7f5]">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <div className="mx-auto max-w-7xl p-6 md:p-10">
          <div className="mb-7">
            <h2 className="text-2xl font-bold">Upload management</h2>
            <p className="mt-1.5 text-sm text-[#71847f]">
              Add and preview visual assets used throughout the streaming
              application.
            </p>
          </div>
          <UploadTabs initialUploads={uploadData} users={userOptions} />
        </div>
      </section>
    </main>
  );
}
