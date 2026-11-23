// Half-screen design heights from the Tulasi integration guide (all designs are 750 wide).
const HEIGHTS = {
  788: ["luckyBoxPro"],
  900: ["gestureWar", "gestureWarPro"],
  902: ["greedyElephant", "greedyElephant2", "greedyElephant2Pro", "greedyElephantPro", "greedyMonkey", "greedyMonkeyPro"],
  920: ["teenPattiBeachParty", "teenPattiBeachPartyPro", "teenPattiBlue", "teenPattiBluePro"],
  1000: ["rocketStarPro", "slots777"],
  1050: ["fruitMachine"],
  1100: ["greedyFoodPro"],
  1200: ["fruitMachineFairy", "fruitMachineFairyPro", "greedy", "greedyBaby", "greedyCatEars", "greedyCatPro", "greedyCatProDark", "greedyDark", "greedyLion", "greedyLion2", "greedyLion2Pro", "greedyLionPro", "greedyPark", "greedyStar2", "greedyStar3", "lucky77Pro", "roulette", "slotsWorldCup"],
  1280: ["greedyCatPlus", "greedyCatPlusPro"],
};
const BY_NAME = new Map(Object.entries(HEIGHTS).flatMap(([h, names]) => names.map((n) => [n, Number(h)])));

export function designSize(gameIdentification) {
  return { designWidth: 750, designHeight: BY_NAME.get(gameIdentification) ?? 750 };
}

export function isPlayable(game, now = new Date()) {
  return game.enabled && game.providerStatus === 1 && (!game.expirationDate || game.expirationDate > now);
}

export function serializeTulasiGame(game) {
  return { gameId: game.tulasiId, name: game.name, identification: game.gameIdentification, description: game.description, image: game.image, banner: game.banner, engine: "tulasi", ...designSize(game.gameIdentification) };
}

export async function listPlayableGames(db) {
  const rows = await db.tulasiGame.findMany({ where: { enabled: true, providerStatus: 1 }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return rows.filter((g) => isPlayable(g)).map(serializeTulasiGame);
}
