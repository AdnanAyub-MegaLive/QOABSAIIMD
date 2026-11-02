import Player from "../../components/game-control/player";
import { Store } from "../../components/game-control/store";
import { gameUtilities } from "@/app/components/game-control/game-utilities";
export const metadata = { title: "Play | Mega Live Games", referrer: "no-referrer" };
export default function GamePlayer() {
  return <div className={`mega-portal ${gameUtilities}`}><Store><Player /></Store></div>;
}
