import { redirect } from "next/navigation";
import { requirePortalAdmin } from "@/lib/portal-admin";
import { canAccessPage, pagePermissions } from "@/lib/portal-permissions";
export default async function Page() {
  const admin = await requirePortalAdmin();
  if (!admin) redirect("/");
  redirect(Object.keys(pagePermissions).find(path => canAccessPage(admin, path)) || "/access-denied");
}
