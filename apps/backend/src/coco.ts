import { Database } from 'bun:sqlite';
import { initializeCoco } from '@cashu/coco-core';
import { SqliteRepositories } from '@cashu/coco-sqlite-bun';
import type { Token } from '@cashu/cashu-ts';
import { PaymentError } from './payment';

export async function openCocoSettlement(options: { databasePath: string; mint: string; seed: Uint8Array }) {
  if (options.seed.length !== 64) throw new Error('Publisher seed must contain exactly 64 bytes');
  const seed = options.seed.slice();
  const database = new Database(options.databasePath, { create: true });
  try {
    const manager = await initializeCoco({
      repo: new SqliteRepositories({ database }), seedGetter: async () => seed.slice(),
      watchers: { mintOperationWatcher: { disabled: true }, proofStateWatcher: { disabled: true }, meltQuoteWatcher: { disabled: true } },
      processors: { mintOperationProcessor: { disabled: true }, meltSettlementProcessor: { disabled: true } },
      // Default logger is silent. Transport debug logs can expose ecash proofs.
    });
    let closing: Promise<void> | undefined;
    return {
      databasePath: options.databasePath,
      async receive(token: Token) {
        if (closing) throw new PaymentError('Payments unavailable', 503);
        if (token.mint !== options.mint || token.unit !== 'sat') throw new PaymentError('Invalid payment mint/unit');
        const { keysets } = await manager.mint.addMint(options.mint, { trusted: true });
        for (const proof of token.proofs) {
          const keyset = keysets.find(k => k.id === proof.id && k.unit === 'sat');
          // Inactive input keysets are redeemable; output keyset selection belongs to Coco.
          if (!keyset || !keyset.keypairs[proof.amount.toString()]) throw new PaymentError('Unsupported payment keyset or denomination');
          if (keyset.feePpk !== 0) throw new PaymentError('Mint no longer supports zero-fee payments', 503);
        }
        const prepared = await manager.ops.receive.prepare({ token });
        const amount = token.proofs.reduce((sum, p) => sum + p.amount.toNumber(), 0);
        if (prepared.mintUrl !== options.mint || prepared.unit !== 'sat' || !prepared.fee.isZero() ||
            prepared.amount.toNumber() !== amount) {
          await manager.ops.receive.cancel(prepared.id, 'Unsupported receive terms');
          throw new PaymentError('Unsupported receive terms', 503);
        }
        // Await the actual swap and durable fresh proofs, never just preparation/checkstate.
        return await manager.ops.receive.execute(prepared.id);
      },
      balance: () => manager.wallet.balances.total({ mintUrls: [options.mint], units: ['sat'] }),
      close() {
        closing ??= (async () => {
          try { await manager.dispose(); }
          finally { database.close(); seed.fill(0); }
        })();
        return closing;
      },
    };
  } catch (error) { database.close(); seed.fill(0); throw error; }
}
