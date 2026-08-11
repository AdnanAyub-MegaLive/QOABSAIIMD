import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const users = [
  [
    "USR-1048",
    "Olivia Martin",
    "olivia@example.com",
    "+1 213 555 0184",
    "United States",
    "CREATOR",
    "ACTIVE",
    5,
    42600,
    284500,
  ],
  [
    "USR-1047",
    "Jackson Lee",
    "jackson@example.com",
    "+1 416 555 0131",
    "Canada",
    "LISTENER",
    "ACTIVE",
    0,
    8200,
    38750,
  ],
  [
    "USR-1046",
    "Sophia Brown",
    "sophia@example.com",
    "+44 20 7946 0152",
    "United Kingdom",
    "HOST",
    "ACTIVE",
    4,
    28900,
    176200,
  ],
  [
    "USR-1045",
    "Noah Williams",
    "noah@example.com",
    "+61 2 5550 0173",
    "Australia",
    "LISTENER",
    "SUSPENDED",
    0,
    950,
    12400,
  ],
  [
    "USR-1044",
    "Emma Wilson",
    "emma@example.com",
    "+971 50 555 0182",
    "United Arab Emirates",
    "CREATOR",
    "ACTIVE",
    3,
    17450,
    98200,
  ],
  [
    "USR-1043",
    "Liam Davis",
    "liam@example.com",
    "+65 6555 0144",
    "Singapore",
    "HOST",
    "PENDING",
    2,
    11600,
    64100,
  ],
];

const talents = [
  [
    "TS-2091",
    "Maya Stone",
    "Maya Elizabeth Stone",
    "maya@example.com",
    "+1 310 555 0198",
    "United States",
    "VIDEO_STREAMER",
    "ACTIVE",
    "VERIFIED",
    184200,
    1248,
    8760,
  ],
  [
    "TH-2088",
    "Aiden Brooks",
    "Aiden James Brooks",
    "aiden@example.com",
    "+44 20 7946 0178",
    "United Kingdom",
    "AUDIO_ROOM_HOST",
    "ACTIVE",
    "VERIFIED",
    126800,
    984,
    7260,
  ],
  [
    "TS-2084",
    "Zara Ali",
    "Zara Noor Ali",
    "zara@example.com",
    "+971 50 555 0182",
    "United Arab Emirates",
    "VIDEO_STREAMER",
    "PENDING",
    "PENDING",
    98500,
    721,
    5040,
  ],
  [
    "TH-2079",
    "Leo Chen",
    "Leo Wei Chen",
    "leo@example.com",
    "+65 6555 0144",
    "Singapore",
    "AUDIO_ROOM_HOST",
    "PENDING",
    "UNDER_REVIEW",
    74100,
    645,
    4620,
  ],
];

const deviceData = [
  [
    "USR-1048",
    "203.0.113.42",
    "A4:C3:F0:82:1D:7B",
    "Los Angeles, United States",
  ],
  ["USR-1047", "198.51.100.18", "3C:52:82:9A:4F:11", "Toronto, Canada"],
  ["USR-1046", "192.0.2.116", "D8:3A:DD:71:B2:09", "London, United Kingdom"],
  ["USR-1045", "203.0.113.91", "70:66:55:C4:28:FE", "Sydney, Australia"],
  [
    "USR-1044",
    "198.51.100.73",
    "B0:BE:76:2C:90:A5",
    "Dubai, United Arab Emirates",
  ],
  ["USR-1043", "192.0.2.204", "48:E7:DA:16:6B:C2", "Singapore, Singapore"],
];

async function main() {
  const admin = await prisma.admin.upsert({
    where: { email: process.env.ADMIN_EMAIL ?? "admin@streamline.com" },
    update: { name: "Platform Admin", active: true, role: "SUPER_ADMIN" },
    create: {
      name: "Platform Admin",
      email: process.env.ADMIN_EMAIL ?? "admin@streamline.com",
      passwordHash: "ENV_AUTH_PENDING_HASH_MIGRATION",
      role: "SUPER_ADMIN",
    },
  });

  const legacyAgency = await prisma.agency.upsert({
    where: { publicId: "AGY-LEGACY" },
    update: { name: "Legacy Host Agency", status: "ACTIVE" },
    create: {
      publicId: "AGY-LEGACY",
      name: "Legacy Host Agency",
      status: "ACTIVE",
    },
  });

  const savedUsers = {};
  for (const [
    publicId,
    name,
    email,
    phone,
    country,
    role,
    status,
    vipLevel,
    coinBalance,
    totalSpent,
  ] of users) {
    const normalizedPhone = phone.replace(/[\s().-]/g, "");
    savedUsers[publicId] = await prisma.user.upsert({
      where: { publicId },
      update: {
        name,
        email,
        phone: normalizedPhone,
        country,
        role,
        status,
        vipLevel,
        coinBalance,
        totalSpent,
        agencyId: role === "HOST" ? legacyAgency.id : null,
      },
      create: {
        publicId,
        name,
        email,
        phone: normalizedPhone,
        country,
        role,
        status,
        vipLevel,
        coinBalance,
        totalSpent,
        agencyId: role === "HOST" ? legacyAgency.id : null,
      },
    });
  }

  const savedTalents = {};
  for (const [
    publicId,
    displayName,
    legalName,
    email,
    phone,
    country,
    type,
    status,
    verification,
    totalGiftsValue,
    followers,
    liveMinutes,
  ] of talents) {
    savedTalents[publicId] = await prisma.talent.upsert({
      where: { publicId },
      update: {
        displayName,
        legalName,
        email,
        phone,
        country,
        type,
        status,
        verification,
        totalGiftsValue,
        followers,
        liveMinutes,
        agencyId: legacyAgency.id,
      },
      create: {
        publicId,
        displayName,
        legalName,
        email,
        phone,
        country,
        type,
        status,
        verification,
        totalGiftsValue,
        followers,
        liveMinutes,
        agencyId: legacyAgency.id,
      },
    });
  }

  for (const [publicId, lastLoginIp, macAddress, location] of deviceData) {
    const user = savedUsers[publicId];
    await prisma.device.upsert({
      where: { userId_macAddress: { userId: user.id, macAddress } },
      update: {
        lastLoginIp,
        location,
        platform: "Mobile",
        deviceName: "Application device",
        lastLoginAt: new Date(),
      },
      create: {
        userId: user.id,
        lastLoginIp,
        macAddress,
        location,
        platform: "Mobile",
        deviceName: "Application device",
        lastLoginAt: new Date(),
      },
    });
  }

  const talentDevices = [
    [
      "TS-2091",
      "54:2A:1B:93:C0:71",
      "203.0.113.55",
      "Los Angeles, United States",
    ],
    ["TH-2088", "9C:DA:3E:45:12:B8", "198.51.100.42", "London, United Kingdom"],
    [
      "TS-2084",
      "2A:81:CC:09:4D:E2",
      "192.0.2.71",
      "Dubai, United Arab Emirates",
    ],
    ["TH-2079", "68:7F:74:21:AE:33", "203.0.113.119", "Singapore, Singapore"],
  ];
  for (const [publicId, macAddress, lastLoginIp, location] of talentDevices) {
    const talent = savedTalents[publicId];
    await prisma.device.upsert({
      where: { talentId_macAddress: { talentId: talent.id, macAddress } },
      update: {
        lastLoginIp,
        location,
        platform: "Mobile",
        lastLoginAt: new Date(),
      },
      create: {
        talentId: talent.id,
        macAddress,
        lastLoginIp,
        location,
        platform: "Mobile",
        lastLoginAt: new Date(),
      },
    });
  }

  if ((await prisma.giftTransaction.count()) === 0) {
    const giftRows = [
      ["USR-1048", "TS-2091", "Diamond Crown", 12, 24000],
      ["USR-1046", "TH-2088", "Golden Microphone", 8, 12800],
      ["USR-1044", "TS-2084", "Super Car", 3, 18000],
      ["USR-1043", "TH-2079", "Rose Bouquet", 25, 5000],
    ];
    for (const [
      senderId,
      talentId,
      giftName,
      quantity,
      coinValue,
    ] of giftRows) {
      await prisma.giftTransaction.create({
        data: {
          senderId: savedUsers[senderId].id,
          talentId: savedTalents[talentId].id,
          giftName,
          quantity,
          coinValue,
          roomId: `ROOM-${talentId}`,
        },
      });
    }
  }

  for (const talent of Object.values(savedTalents)) {
    if (
      (await prisma.talentVerification.count({
        where: { talentId: talent.id },
      })) === 0
    ) {
      await prisma.talentVerification.create({
        data: {
          talentId: talent.id,
          reviewedById: talent.verification === "VERIFIED" ? admin.id : null,
          status: talent.verification,
          identityCardFront: "/uploads/identity/front-placeholder.jpg",
          identityCardBack: "/uploads/identity/back-placeholder.jpg",
          profileImage: "/uploads/profiles/placeholder.jpg",
          reviewedAt: talent.verification === "VERIFIED" ? new Date() : null,
        },
      });
    }
    if (
      (await prisma.salaryHistory.count({ where: { talentId: talent.id } })) ===
      0
    ) {
      await prisma.salaryHistory.create({
        data: {
          talentId: talent.id,
          adminId: admin.id,
          periodStart: new Date("2026-06-01"),
          periodEnd: new Date("2026-06-30"),
          amount: "3500.00",
          currency: "USD",
          status: "PAID",
          notes: "Seeded monthly salary record",
          paidAt: new Date("2026-07-05"),
        },
      });
    }
  }

  if ((await prisma.coinAdjustment.count()) === 0) {
    const user = savedUsers["USR-1048"];
    await prisma.coinAdjustment.create({
      data: {
        userId: user.id,
        adminId: admin.id,
        operation: "ADD",
        amount: 5000,
        balanceBefore: 37600,
        balanceAfter: 42600,
        reason: "Initial promotional coin adjustment",
      },
    });
  }

  if ((await prisma.userAlbumItem.count()) === 0) {
    for (const [index, user] of Object.values(savedUsers).entries())
      await prisma.userAlbumItem.create({
        data: {
          userId: user.id,
          mediaUrl: `/uploads/albums/sample-${index + 1}.jpg`,
          caption: "Profile album image",
          status: index === 3 ? "PENDING" : "APPROVED",
        },
      });
  }
  const specialIdDefinitions = [
    ["8888", "SVIP", 5, null, 43200],
    ["VIP55", "VIP", 3, null, 20160],
    ["TOPUP1", "VIP", null, 100000, 10080],
    ["STAR77", "STANDARD", null, null, 10080],
  ];
  for (const [
    code,
    category,
    minimumVipLevel,
    minimumTopUpAmount,
    defaultDurationMinutes,
  ] of specialIdDefinitions) {
    await prisma.specialIdDefinition.upsert({
      where: { code },
      update: {
        category,
        minimumVipLevel,
        minimumTopUpAmount,
        defaultDurationMinutes,
        active: true,
      },
      create: {
        code,
        category,
        minimumVipLevel,
        minimumTopUpAmount,
        defaultDurationMinutes,
      },
    });
  }
  if ((await prisma.specialIdAssignment.count()) === 0) {
    const definition = await prisma.specialIdDefinition.findUniqueOrThrow({
      where: { code: "STAR77" },
    });
    await prisma.specialIdAssignment.create({
      data: {
        userId: savedUsers["USR-1048"].id,
        definitionId: definition.id,
        specialId: definition.code,
        status: "ACTIVE",
        source: "ADMIN",
        expiresAt: new Date("2027-01-01"),
      },
    });
  }
  if ((await prisma.gameLog.count()) === 0) {
    const gameNames = ["Lucky Wheel", "Teen Patti", "Fruit Party", "Car Race"];
    for (const [index, user] of Object.values(savedUsers).entries())
      await prisma.gameLog.create({
        data: {
          userId: user.id,
          gameName: gameNames[index % gameNames.length],
          wager: 1000 + index * 250,
          payout: index % 2 === 0 ? 2200 + index * 300 : 0,
          result: index % 2 === 0 ? "WIN" : "LOSS",
          referenceId: `GAME-${user.publicId}-${index + 1}`,
        },
      });
  }
  if ((await prisma.liveSession.count()) === 0) {
    for (const [index, talent] of Object.values(savedTalents).entries())
      await prisma.liveSession.create({
        data: {
          talentId: talent.id,
          roomId: `ROOM-${talent.publicId}-01`,
          streamType: talent.type.includes("AUDIO") ? "AUDIO" : "VIDEO",
          startedAt: new Date(Date.now() - (index + 1) * 86400000),
          endedAt: new Date(Date.now() - (index + 1) * 86400000 + 5400000),
          peakViewers: 420 + index * 135,
          giftsValue: 12500 + index * 4800,
          status: "COMPLETED",
        },
      });
  }
  if ((await prisma.talentPerformance.count()) === 0) {
    for (const [index, talent] of Object.values(savedTalents).entries())
      await prisma.talentPerformance.create({
        data: {
          talentId: talent.id,
          period: "2026-07",
          liveMinutes: 2100 + index * 320,
          uniqueViewers: 18400 + index * 3100,
          newFollowers: 640 + index * 95,
          giftsValue: 56000 + index * 12500,
          engagementRate: String(12.5 + index * 1.7),
        },
      });
  }
  if ((await prisma.talentViolation.count()) === 0) {
    const talent = Object.values(savedTalents)[2];
    await prisma.talentViolation.create({
      data: {
        talentId: talent.id,
        category: "CONTENT_POLICY",
        severity: "MEDIUM",
        description:
          "Unapproved background audio detected during a live session.",
        status: "OPEN",
        actionTaken: "Warning issued",
      },
    });
  }
  if ((await prisma.audioRoom.count()) === 0) {
    await prisma.audioRoom.create({
      data: {
        roomId: "AUDIO-ROOM-1001",
        ownerId: savedUsers["USR-1048"].id,
        title: "Late Night Music Lounge",
        status: "ENDED",
        recordingUrl:
          "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        participantCount: 84,
        startedAt: new Date(Date.now() - 7200000),
        endedAt: new Date(Date.now() - 3600000),
      },
    });
  }

  const walletPackages = [
    ["COIN_1000", 1000n, 0, "50", false, 10],
    ["COIN_5000", 5000n, 5, "240", false, 20],
    ["COIN_10000", 10000n, 10, "460", false, 30],
    ["COIN_25000", 25000n, 20, "1050", true, 40],
    ["COIN_50000", 50000n, 25, "2000", false, 50],
  ];
  for (const [id, coins, bonusPercent, price, bestValue, sortOrder] of walletPackages)
    await prisma.walletCoinPackage.upsert({
      where: { id },
      update: { coins, bonusPercent, price, bestValue, sortOrder, currency: "PKR", active: true },
      create: { id, coins, bonusPercent, price, bestValue, sortOrder, currency: "PKR" },
    });

  if ((await prisma.auditLog.count()) === 0) {
    await prisma.auditLog.createMany({
      data: [
        {
          adminId: admin.id,
          action: "DATABASE_SEEDED",
          category: "SYSTEM",
          entityType: "Database",
          description:
            "Initial portal records were synchronized with PostgreSQL.",
        },
        {
          adminId: admin.id,
          action: "ADMIN_SIGN_IN",
          category: "AUTHENTICATION",
          entityType: "Admin",
          entityId: admin.id,
          description: "Platform administrator authenticated successfully.",
        },
        {
          adminId: admin.id,
          action: "SCHEMA_SYNCHRONIZED",
          category: "SYSTEM",
          entityType: "Database",
          description: "Prisma schema synchronized with the portal database.",
        },
      ],
    });
  }

  console.log(
    `Seed complete: ${await prisma.user.count()} users, ${await prisma.talent.count()} talents, ${await prisma.device.count()} devices.`,
  );
}

main().finally(() => prisma.$disconnect());
