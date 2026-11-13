import dotenv from 'dotenv';
import { alignBusinessSchedules } from '../src/lib/business-time-migration.js';
dotenv.config({ path: '.env.local', quiet: true });
const { prisma } = await import('../src/lib/prisma.js');
try { console.log(await alignBusinessSchedules(prisma)); }
finally { await prisma.$disconnect(); }
