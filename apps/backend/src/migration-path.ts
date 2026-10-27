import { fileURLToPath } from 'node:url';

// src/ and dist/ are siblings, so this also resolves from the compiled entry point.
export const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
