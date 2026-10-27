import { sameDatabaseFile } from './db/paths';
import { startPublisher } from './app';
import { databasePath } from './db/config';
import { openCocoSettlement } from './coco';

export { startPublisher } from './app';
export type { PublisherOptions } from './app';

if (import.meta.main) {
  let settlement: Awaited<ReturnType<typeof openCocoSettlement>> | undefined;
  try {
    const secret = process.env.PUBLISHER_SEED_HEX;
    if (!secret || !/^[0-9a-fA-F]{128}$/.test(secret)) throw new Error('Invalid publisher seed');
    const cocoPath = process.env.COCO_DATABASE_PATH ?? './coco.sqlite';
    if (sameDatabaseFile(cocoPath, databasePath) || [cocoPath, databasePath].includes(':memory:')) throw new Error('Separate database files required');
    const seed = Uint8Array.from(Buffer.from(secret, 'hex'));
    try { settlement = await openCocoSettlement({ databasePath: cocoPath, mint: 'https://mint.minibits.cash/Bitcoin', seed }); }
    finally { seed.fill(0); }
    const publisher = startPublisher({
      hostname: process.env.HOST ?? '127.0.0.1', port: Number(process.env.PORT ?? 3000),
      databasePath, publicOrigin: process.env.PUBLIC_ORIGIN, settlement,
    });
    console.log(`Backend listening on ${publisher.url}`);
    let stopping = false;
    async function shutdown() {
      if (stopping) return;
      stopping = true;
      try { await publisher.stop(); }
      catch { console.error('Publisher shutdown failed.'); process.exitCode = 1; }
    }
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch {
    try { await settlement?.close(); } catch { /* Keep startup errors secret-free. */ }
    // Do not print underlying exceptions: mint/crypto errors may include proofs/secrets.
    console.error('Publisher startup failed. Check the 64-byte PUBLISHER_SEED_HEX, separate database paths, and listener configuration.');
    process.exitCode = 1;
  }
}
