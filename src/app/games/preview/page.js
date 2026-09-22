import { redirect } from "next/navigation";
import { auth } from "../../../../auth.js";
import { prisma } from "@/lib/prisma";
import { ensureGames, serializeGame } from "@/lib/game-control/service";
import Player from "../../components/game-control/player";
import { Store } from "../../components/game-control/store";
import "../../components/game-control/portal.css";
export const metadata = { title: "Practice Preview | Mega Live Games" };
export default async function GamePreview() {
  if (!(await auth())?.user) redirect("/");
  await ensureGames();
  const games = (await prisma.gameDefinition.findMany()).map(serializeGame);
  return <div className="mega-portal"><Store preview previewGames={games}><Player /></Store></div>;
}
