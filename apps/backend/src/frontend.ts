import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Snapshot only the public build. Never expose the repository or arbitrary paths. */
export function frontendFiles(directory: string) {
  const files = new Map<string, (head: boolean) => Response>();
  function add(url: string, path: string) {
    if (!lstatSync(path).isFile()) throw new Error('Frontend build must contain regular files');
    const body = readFileSync(path);
    files.set(url, head => new Response(head ? null : body, { headers: {
      'Content-Type': Bun.file(path).type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    } }));
  }
  add('/', join(directory, 'index.html'));
  const assets = join(directory, 'assets');
  if (!lstatSync(assets).isDirectory()) throw new Error('Frontend assets must be a directory');
  for (const entry of readdirSync(assets, { withFileTypes: true })) {
    if (entry.isFile() && !entry.name.startsWith('.') && /\.(js|css|woff2?|png|svg|jpe?g|webp|ico|avif|gif)$/.test(entry.name)) {
      add(`/assets/${entry.name}`, join(assets, entry.name));
    }
  }
  return files;
}
