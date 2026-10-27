import { statSync } from 'node:fs';
import { resolve } from 'node:path';

export function sameDatabaseFile(first: string, second: string) {
  if (first === ':memory:' || second === ':memory:') return false;
  if (resolve(first) === resolve(second)) return true;
  try {
    const a = statSync(first), b = statSync(second);
    return a.dev === b.dev && a.ino === b.ino;
  } catch { return false; }
}
