import fs from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

// Published bundles remain self-contained: no runtime CDN compiler is needed.
const root = path.resolve('event-templates');
for (const directory of await fs.readdir(root)) {
  const source = path.join(root, directory, 'tailwind.css');
  try {
    await fs.access(source);
  } catch {
    continue;
  }
  const result = await postcss([tailwind({ optimize: true })]).process(
    await fs.readFile(source, 'utf8'), { from: source, to: path.join(root, directory, 'style.css') },
  );
  await fs.writeFile(path.join(root, directory, 'style.css'), result.css);
  console.log(`Built Tailwind event stylesheet: ${directory}`);
}

const fallback = await postcss([tailwind({ optimize: true })]).process(
  '@import "tailwindcss" source(none); @source inline("font-sans text-center py-[10vh] px-8 text-2xl font-bold mb-4");',
  { from: path.resolve('src/app/event-fallback.css') },
);
await fs.writeFile(path.resolve('public/event-unavailable.css'), fallback.css);
