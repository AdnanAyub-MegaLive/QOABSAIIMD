// Run on the deployed server. Preserves rewards and skips unpublished events.
import dotenv from 'dotenv';
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
dotenv.config({ path: '.env.local', quiet: true });
const { prisma } = await import('../src/lib/prisma.js');
const { uploadNewVersion } = await import('../src/lib/events/service.js');
try {
  const user = await prisma.eventUser.findFirst({ where: { active: true, role: 'SUPER_ADMIN' }, orderBy: { id: 'asc' } });
  if (!user) throw new Error('An active Events Super Admin is required.');
  for (const slug of ['rankings', 'ranking-wealth', 'ranking-charm', 'ranking-game', 'ranking-cp']) {
    const event = await prisma.event.findUnique({ where: { slug } });
    if (!event || event.status !== 'PUBLISHED') { console.log(`${slug}: skipped (not published)`); continue; }
    const root = path.resolve('event-templates', slug);
    const names = await readdir(root);
    const files = ['index.html', 'style.css', 'app.js', ...(names.includes('design.js') ? ['design.js'] : []),
      ...(await readdir(path.join(root, 'assets'))).map(name => `assets/${name}`)];
    const formData = new FormData();
    for (const name of files) {
      formData.append('files', new File([await readFile(path.join(root, name))], path.basename(name)));
      formData.append('paths', name);
    }
    const updated = await uploadNewVersion({ id: event.id, formData, user, ip: '127.0.0.1' });
    console.log(`${slug}: published version ${updated.version}`);
  }
} finally { await prisma.$disconnect(); }
