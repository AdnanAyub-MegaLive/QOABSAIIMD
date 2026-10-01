import Player from "../../components/game-control/player";
import { Store } from "../../components/game-control/store";
import "../../components/game-control/portal.css";
export const metadata = { title: "Play | Mega Live Games", referrer: "no-referrer" };
export default function GamePlayer() {
  return <div className="mega-portal"><Store><Player /></Store></div>;
}
