import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';

// Keep asset paths intact, including nested reward artwork.
export async function rankingTemplateForm(root) {
  async function assetFiles(directory) {
    const files = [];
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      const name = `${directory}/${entry.name}`;
      if (entry.isDirectory()) files.push(...await assetFiles(name));
      else if (entry.isFile()) files.push(name);
      else throw new Error(`Unsupported template entry: ${name}`);
    }
    return files.sort();
  }
  const entries = await readdir(root, { withFileTypes: true });
  const filenames = [
    ...entries.filter(entry => entry.isFile() && /\.(html|css|js|json)$/.test(entry.name) && entry.name !== 'tailwind.css').map(entry => entry.name),
    ...await assetFiles('assets'),
  ];
  const form = new FormData();
  for (const filename of filenames) {
    form.append('files', new File([await readFile(path.join(root, filename))], path.basename(filename)));
    form.append('paths', filename);
  }
  return form;
}
