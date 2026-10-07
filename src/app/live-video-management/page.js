import { requirePagePermission } from "@/lib/portal-admin";

import { redirect } from "next/navigation";
import { auth } from "../../../auth";


export default async function LiveVideoManagementPage(){await requirePagePermission("video.view");
  const session=await auth();if(!session?.user)redirect("/");redirect("/live-management")}
