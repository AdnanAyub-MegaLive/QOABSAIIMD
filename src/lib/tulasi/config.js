export const TULASI_DEFAULT_GAME_DOMAIN = "https://gamesp.tulasigame.com/";
export const TULASI_ROOM_ID = 111;
export const TULASI_LANGS = new Set(["en", "ar", "ko", "ja", "bn", "ru", "de", "fr"]);

export function tulasiConfig(env = process.env) {
  const merchantId = String(env.TULASI_MERCHANT_ID ?? "").trim();
  const platformPublicKey = String(env.TULASI_PLATFORM_PUBLIC_KEY ?? "").trim();
  const merchantPrivateKey = String(env.TULASI_MERCHANT_PRIVATE_KEY ?? "").trim();
  let gameDomain = String(env.TULASI_GAME_DOMAIN ?? "").trim() || TULASI_DEFAULT_GAME_DOMAIN;
  if (!gameDomain.endsWith("/")) gameDomain += "/";
  return { merchantId, platformPublicKey, merchantPrivateKey, gameDomain, enabled: Boolean(merchantId && platformPublicKey && merchantPrivateKey) };
}
