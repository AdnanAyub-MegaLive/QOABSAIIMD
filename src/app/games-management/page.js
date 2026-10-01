import { requirePagePermission } from "@/lib/portal-admin";
import { redirect } from "next/navigation";
import { auth } from "../../../auth.js";
import Portal from "../components/game-control/portal";
import { Store } from "../components/game-control/store";
import "../components/game-control/portal.css";
export const metadata = { title: "Games Management | Mega Live Portal" };
export default async function GamesManagement() {
  await requirePagePermission("games.view");
  if (!(await auth())?.user) redirect("/");
  return <div className="mega-portal"><Store><Portal /></Store></div>;
}
