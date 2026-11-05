import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { resolveUserPerks } from '../user-perks.js';
import { avatarDisplayUrl } from '../avatar-history.js';
import { configuredRankingWindow } from './ranking-contract.js';
import { vipIsActive } from '../vip-contract.js';
import { activitySnapshot } from '../activity-levels.js';
import { levelTagBackgrounds, tagBackground } from '../level-tag-backgrounds.js';
import { decorationMedia } from '../decoration-media.js';

// Gift rankings use gift face value; Game uses settled Coin wagers, never payouts, wallet balances or XP.
// Historical agency attribution comes from the committed settlement, not today's membership.
export async function eventRankings({ type, period, offset = 0, q = '', viewerId = null, origin, window, raw = false }, db = prisma) {
  const now = new Date(), selectedWindow = window ?? await configuredRankingWindow(db, type, period, now);
  const { start, end } = selectedWindow;
  const base = Prisma.sql`
    WITH people AS (
      SELECT u.* FROM "User" u WHERE u.status = 'ACTIVE' AND u."deletedAt" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "Ban" b WHERE b."userId"=u.id AND b.target='USER' AND b."revokedAt" IS NULL AND (b."expiresAt" IS NULL OR b."expiresAt">${now}))
    ), gifts AS (
      SELECT g.*, COALESCE(g."recipientUserId", mapped.id) AS receiver
      FROM "GiftTransaction" g LEFT JOIN "Talent" t ON t.id=g."talentId"
      LEFT JOIN "User" mapped ON mapped."publicId"=t."publicId"
      WHERE g."reversedAt" IS NULL AND g."createdAt">=${start} AND g."createdAt"<${end}
    )`;
  let scores;
  if (type === 'agency') scores = Prisma.sql`
    SELECT a.id,a."publicId",a.name,a.level,a.country,a."ownerUserId" AS "personId",NULL::text AS "partnerId",
      (SELECT COUNT(*)::int FROM people h WHERE h."agencyId"=a.id AND ('HOST'=ANY(h."appRoles") OR h.role='HOST')) AS "memberCount",
      SUM(g."coinValue") AS score
    FROM gifts g JOIN "GiftSettlement" s ON s."giftTransactionId"=g.id
    JOIN "Agency" a ON a.id=s."agencyId" JOIN people owner ON owner.id=a."ownerUserId"
    WHERE a.status='ACTIVE' GROUP BY a.id`;
  else if (type === 'cp') scores = Prisma.sql`
    SELECT r.id,r."publicId",(l.name || ' & ' || rr.name) AS name,r.level,NULL::text AS country,
      r."leftUserId" AS "personId",r."rightUserId" AS "partnerId",2::int AS "memberCount",SUM(g."coinValue") AS score
    FROM "ProfileRelationship" r JOIN people l ON l.id=r."leftUserId" JOIN people rr ON rr.id=r."rightUserId"
    JOIN gifts g ON ((g."senderId"=l.id AND g.receiver=rr.id) OR (g."senderId"=rr.id AND g.receiver=l.id)) AND g."createdAt">=r."startedAt"
    WHERE r.type='CP' AND r.status='ACTIVE' AND r."leftAcceptedAt" IS NOT NULL AND r."rightAcceptedAt" IS NOT NULL
    AND (r."expiresAt" IS NULL OR r."expiresAt">${now}) GROUP BY r.id,l.name,rr.name`;
  else if (type === 'game') scores = Prisma.sql`
    SELECT u.id,u."publicId",u.name,0::int AS level,u.country,u.id AS "personId",NULL::text AS "partnerId",0::int AS "memberCount",SUM(e.amount) AS score
    FROM "SharedGameEntry" e JOIN people u ON u.id=e."userId"
    WHERE e.status='SETTLED' AND e.input->>'currency'='COINS' AND e.amount>0
      AND e."settledAt">=${start} AND e."settledAt"<${end}
    GROUP BY u.id,u."publicId",u.name,u.country`;
  else scores = Prisma.sql`
    SELECT u.id,u."publicId",u.name,0::int AS level,u.country,u.id AS "personId",NULL::text AS "partnerId",0::int AS "memberCount",SUM(g."coinValue") AS score
    FROM gifts g JOIN people u ON u.id=${type === 'wealth' ? Prisma.sql`g."senderId"` : Prisma.sql`g.receiver`} GROUP BY u.id,u."publicId",u.name,u.country`;
  // Rank before filtering search results, so an agency's global rank stays stable.
  const ranked = Prisma.sql`${base}, scores AS (${scores}), ranked AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC, ${['wealth','charm'].includes(type) ? Prisma.sql`COALESCE((SELECT t.level FROM "VipMembership" v JOIN "VipTier" t ON t.id=v."tierId" WHERE v."userId"=scores."personId" AND v."revokedAt" IS NULL AND v."startsAt"<=${now} AND v."expiresAt">${now} AND t.active=true AND 'RANKING_PRIORITY'=ANY(t.privileges)),0)` : Prisma.sql`0::int`} DESC,"publicId" ASC) AS rank FROM scores WHERE score>0
  ), chase AS (SELECT *, LAG(score) OVER (ORDER BY rank) - score AS gap FROM ranked)`;
  const rows = await db.$queryRaw(Prisma.sql`${ranked} SELECT * FROM chase ranked WHERE (${q}='' OR POSITION(LOWER(${q}) IN LOWER(name))>0 OR POSITION(LOWER(${q}) IN LOWER("publicId"))>0)
    AND NOT EXISTS (SELECT 1 FROM "UserBlock" b WHERE
      (b."blockerId"=${viewerId} AND b."blockedId" IN (ranked."personId", ranked."partnerId")) OR
      (b."blockedId"=${viewerId} AND b."blockerId" IN (ranked."personId", ranked."partnerId")))
    ORDER BY rank LIMIT 21 OFFSET ${offset}`);
  if (raw) return rows.slice(0, 20).map(row => ({ id: row.publicId, rank: Number(row.rank), score: row.score.toString(), recipients: [...new Set([row.personId, row.partnerId].filter(Boolean))] }));
  const [viewer] = viewerId ? await db.$queryRaw(Prisma.sql`${ranked}
    SELECT rank, gap FROM (
      SELECT rank, "personId", "partnerId", id, LAG(score) OVER (ORDER BY rank) - score AS gap FROM ranked
    ) standings WHERE "personId"=${viewerId} OR "partnerId"=${viewerId}
      ${type === 'agency' ? Prisma.sql`OR id=(SELECT "agencyId" FROM people WHERE id=${viewerId})` : Prisma.empty}
    ORDER BY rank LIMIT 1`) : [];
  const hasMore = rows.length > 20, visible = rows.slice(0, 20);
  const ids = [...new Set(visible.flatMap(row => [row.personId, row.partnerId]).filter(Boolean))];
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, publicId: true, name: true, profileImage: true, country: true,
    ...(type === 'cp' ? {} : { vipMembership: { include: { tier: { include: { assets: { where: { privilege: { in: ['VIP_LOGO', 'BADGE'] }, asset: { active: true } }, orderBy: { assetId: 'asc' }, include: { asset: { select: { publicId: true, mimeType: true, mediaVersion: true, posterMimeType: true, posterMediaVersion: true } } } } } } } } }),
    uploadAssignments: { where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], ...(type === 'cp' ? {} : { source: { not: 'VIP_TIER' } }), asset: { active: true, category: 'BADGES', ...(type === 'cp' ? {} : { vipBenefits: { none: { privilege: { in: ['VIP_LOGO', 'BADGE'] } } } }) } },
      orderBy: [{ assignedAt: 'desc' }, { assetId: 'asc' }], take: 5,
      select: { asset: { select: { publicId: true, name: true, mimeType: true, mediaVersion: true, posterMimeType: true, posterMediaVersion: true } } } },
  } });
  const perks = await resolveUserPerks(users, origin, ['FRAMES', 'BADGES']);
  // Read agency XP in one batch; legacy Agency.level is not the configured progression level.
  const agencyProgress = new Map();
  if (type === 'agency' && visible.length) {
    const [rule, totals] = await Promise.all([
      db.activityLevelRule.findUnique({ where: { track: 'AGENCY' } }),
      db.activityLevelAward.groupBy({ by: ['subjectId'], where: { track: 'AGENCY', subjectId: { in: visible.map(r => r.id) } }, _sum: { xp: true } }),
    ]);
    for (const row of visible) agencyProgress.set(row.id, activitySnapshot(rule, totals.find(t => t.subjectId === row.id)?._sum.xp ?? 0n, origin));
    const backgrounds = await levelTagBackgrounds(db, origin, [...agencyProgress.values()].map(p => ({ track: 'AGENCY', level: p.level })));
    for (const [id, progress] of agencyProgress) agencyProgress.set(id, { ...progress, ...tagBackground(backgrounds, 'AGENCY', progress.level) });
  }
  const identities = new Map(users.map(u => {
    if (type === 'agency') return [u.id, { name: u.name, profileImage: avatarDisplayUrl(u.profileImage, origin), country: u.country }];
    const p = perks.get(u.publicId), levels = p?.progression;
    const membership = vipIsActive(u.vipMembership, now) ? u.vipMembership : null;
    const vipAsset = membership?.tier.assets.find(a => a.privilege === 'VIP_LOGO')?.asset ?? membership?.tier.assets.find(a => a.privilege === 'BADGE')?.asset;
    return [u.id, { vipPrivileges: p?.vipPrivileges ?? [], vipNameColor: p?.vipNameColor ?? null, name: u.name, profileImage: avatarDisplayUrl(u.profileImage, origin), country: u.country,
      ...(type === 'cp' ? {} : { vip: membership ? { level: membership.tier.level, artwork: vipAsset ? decorationMedia(vipAsset, origin) : null } : null }),
      ownedBadges: (u.uploadAssignments ?? []).map(({asset}) => ({ ...decorationMedia(asset, origin), name: asset.name })),
      userLevel: levels?.userLevel ?? 0, charmLevel: levels?.charmLevel ?? 0,
      userLevelBadgeUrl: levels?.userLevelBadgeUrl ?? null, charmLevelBadgeUrl: levels?.charmLevelBadgeUrl ?? null,
      ...Object.fromEntries(['user', 'charm'].flatMap(track =>
        ['Url', 'MimeType', 'PosterUrl'].map(suffix => {
          const key = `${track}LevelBackground${suffix}`;
          return [key, levels?.[key] ?? null];
        }))),
      frameUrl: p?.frameUrl ?? null, frameMimeType: p?.frameMimeType ?? null, framePosterUrl: p?.framePosterUrl ?? null,
      badgeUrl: p?.badgeUrl ?? null, badgeMimeType: p?.badgeMimeType ?? null, badgePosterUrl: p?.badgePosterUrl ?? null }];
  }));
  return { type, period, cycle: period === 'month' ? { days:selectedWindow.days, key:selectedWindow.key, revision:selectedWindow.revision, start:start.toISOString(), endExclusive:end.toISOString() } : null, generatedAt: now.toISOString(), resetsAt: end.toISOString(), timezone: 'UTC', scoreUnit: type === 'charm' ? 'diamonds' : 'coins',
    viewer: viewer ? { rank: Number(viewer.rank), gap: viewer.gap?.toString() ?? null } : null,
    rule: type === 'game' ? 'Coins wagered in settled games during this period, across all rooms. Pending, cancelled and play-point entries are excluded; winnings do not affect the score.' : type === 'agency' ? 'Gift value received by hosts, attributed to their agency at gift settlement.' : type === 'cp' ? 'Gift value exchanged between active CP partners since their relationship began.' : type === 'wealth' ? 'Gift value sent during this period.' : 'Gift value received during this period.',
    entries: visible.map(row => ({ ...(type === 'agency' ? { id: row.publicId } : {}), name: row.name, rank: Number(row.rank), gap: row.gap?.toString() ?? null, level: type === 'agency' ? agencyProgress.get(row.id)?.level ?? null : row.level,
      ...(type === 'agency' ? { agencyLevel: agencyProgress.get(row.id)?.level ?? null, agencyLevelBackgroundUrl: agencyProgress.get(row.id)?.backgroundUrl ?? null, agencyLevelBackgroundMimeType: agencyProgress.get(row.id)?.backgroundMimeType ?? null, agencyLevelBackgroundPosterUrl: agencyProgress.get(row.id)?.backgroundPosterUrl ?? null } : {}), country: row.country,
      ...(type === 'agency' ? {} : { memberCount: row.memberCount }), person: identities.get(row.personId) ?? null, partner: identities.get(row.partnerId) ?? null })),
    nextOffset: hasMore ? offset + 20 : null };
}
