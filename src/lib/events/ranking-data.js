import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { resolveUserPerks } from '../user-perks.js';
import { avatarDisplayUrl } from '../avatar-history.js';
import { rankingWindow } from './ranking-contract.js';
import { decorationMedia } from '../decoration-media.js';

// Event scores are gift face value in Coins, never wallet balances or XP.
// Historical agency attribution comes from the committed settlement, not today's membership.
export async function eventRankings({ type, period, offset = 0, q = '', viewerId = null, origin, window, raw = false }, db = prisma) {
  const now = new Date(), { start, end } = window ?? rankingWindow(period, now);
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
  else scores = Prisma.sql`
    SELECT u.id,u."publicId",u.name,0::int AS level,u.country,u.id AS "personId",NULL::text AS "partnerId",0::int AS "memberCount",SUM(g."coinValue") AS score
    FROM gifts g JOIN people u ON u.id=${type === 'wealth' ? Prisma.sql`g."senderId"` : Prisma.sql`g.receiver`} GROUP BY u.id,u."publicId",u.name,u.country`;
  // Rank before filtering search results, so an agency's global rank stays stable.
  const rows = await db.$queryRaw(Prisma.sql`${base}, scores AS (${scores}), ranked AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC,"publicId" ASC) AS rank FROM scores WHERE score>0
  ) SELECT * FROM ranked WHERE (${q}='' OR POSITION(LOWER(${q}) IN LOWER(name))>0 OR POSITION(LOWER(${q}) IN LOWER("publicId"))>0)
    AND NOT EXISTS (SELECT 1 FROM "UserBlock" b WHERE
      (b."blockerId"=${viewerId} AND b."blockedId" IN (ranked."personId", ranked."partnerId")) OR
      (b."blockedId"=${viewerId} AND b."blockerId" IN (ranked."personId", ranked."partnerId")))
    ORDER BY rank LIMIT 21 OFFSET ${offset}`);
  if (raw) return rows.slice(0, 20).map(row => ({ id: row.publicId, rank: Number(row.rank), score: row.score.toString(), recipients: [...new Set([row.personId, row.partnerId].filter(Boolean))] }));
  const hasMore = rows.length > 20, visible = rows.slice(0, 20);
  const ids = [...new Set(visible.flatMap(row => [row.personId, row.partnerId]).filter(Boolean))];
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, publicId: true, name: true, profileImage: true, country: true,
    uploadAssignments: { where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], asset: { active: true, category: 'BADGES' } },
      orderBy: [{ assignedAt: 'desc' }, { assetId: 'asc' }], take: 5,
      select: { asset: { select: { publicId: true, name: true, mimeType: true, mediaVersion: true, posterMimeType: true, posterMediaVersion: true } } } },
  } });
  const perks = await resolveUserPerks(users, origin, ['FRAMES', 'BADGES']);
  const identities = new Map(users.map(u => {
    const p = perks.get(u.publicId), levels = p?.progression;
    return [u.id, { publicId: u.publicId, name: u.name, profileImage: avatarDisplayUrl(u.profileImage, origin), country: u.country,
      ownedBadges: (u.uploadAssignments ?? []).map(({asset}) => ({ ...decorationMedia(asset, origin), name: asset.name })),
      userLevel: levels?.userLevel ?? 0, charmLevel: levels?.charmLevel ?? 0,
      userLevelBadgeUrl: levels?.userLevelBadgeUrl ?? null, charmLevelBadgeUrl: levels?.charmLevelBadgeUrl ?? null,
      ...Object.fromEntries(['user', 'charm'].flatMap(track =>
        ['Url', 'MimeType', 'PosterUrl'].map(suffix => {
          const key = `${track}LevelBackground${suffix}`;
          return [key, levels?.[key] ?? null];
        }))),
      badgeUrl: p?.badgeUrl ?? null, badgeMimeType: p?.badgeMimeType ?? null, badgePosterUrl: p?.badgePosterUrl ?? null }];
  }));
  return { type, period, generatedAt: now.toISOString(), resetsAt: end.toISOString(), timezone: 'UTC', scoreUnit: 'Coins',
    rule: type === 'agency' ? 'Gift value received by hosts, attributed to their agency at gift settlement.' : type === 'cp' ? 'Gift value exchanged between active CP partners since their relationship began.' : type === 'wealth' ? 'Gift value sent during this period.' : 'Gift value received during this period.',
    entries: visible.map(row => ({ id: row.publicId, name: row.name, rank: Number(row.rank), score: row.score.toString(), level: row.level, country: row.country,
      memberCount: row.memberCount, person: identities.get(row.personId) ?? null, partner: identities.get(row.partnerId) ?? null })),
    nextOffset: hasMore ? offset + 20 : null };
}
