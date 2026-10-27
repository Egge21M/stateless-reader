import { test, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { readerFromPasskey, deriveArticleKey, signArticleRequest } from '@stateless-reader/core';
import { startFakeMint } from '../tests/fake-mint';
import { startPublisher } from './app';
import { migrateApplication } from './db/migrate';
import { openCocoSettlement } from './coco';

test.each([false, true])('real Coco settles, retains funds, and restarts (inactive inputs: %s)', async (inactiveInput) => {
  const dir = await mkdtemp('/tmp/real-coco-');
  const mint = startFakeMint({ inactiveInput });
  let settlement = await openCocoSettlement({ databasePath: `${dir}/coco.sqlite`, mint: mint.url, seed: new Uint8Array(64).fill(42) });
  migrateApplication(`${dir}/grants.sqlite`);
  let publisher = startPublisher({ port: 0, databasePath: `${dir}/grants.sqlite`, mint: mint.url, settlement });
  try {
    const { seed } = await readerFromPasskey(new Uint8Array(32).fill(1));
    const publicKey = deriveArticleKey(seed, 'the-quiet-web').publicKey;
    const pay = await fetch(new URL(`/payment/the-quiet-web/${publicKey}`, publisher.url), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mint: mint.url, unit: 'sat', proofs: [mint.issue(16), mint.issue(4), mint.issue(1)] }),
    });
    expect(pay.status).toBe(200);
    expect((await settlement.balance()).spendable.toNumber()).toBe(21);
    const content = await fetch(new URL('/article/the-quiet-web', publisher.url), { headers: {
      authorization: signArticleRequest(seed, { articleId: 'the-quiet-web', method: 'GET', path: '/article/the-quiet-web', timestamp: Math.floor(Date.now()/1000) }),
    } });
    expect(content.status).toBe(200);
    expect((await content.json() as { body: string }).body).toContain('A quiet website begins with a stopping point.');
    await publisher.stop();
    settlement = await openCocoSettlement({ databasePath: `${dir}/coco.sqlite`, mint: mint.url, seed: new Uint8Array(64).fill(42) });
    publisher = startPublisher({ port: 0, databasePath: `${dir}/grants.sqlite`, mint: mint.url, settlement });
    expect((await settlement.balance()).spendable.toNumber()).toBe(21);
    const reopened = await fetch(new URL('/article/the-quiet-web', publisher.url), { headers: {
      authorization: signArticleRequest(seed, { articleId: 'the-quiet-web', method: 'GET', path: '/article/the-quiet-web', timestamp: Math.floor(Date.now()/1000) }),
    } });
    expect(reopened.status).toBe(200);
  } finally { await publisher.stop(); await mint.stop(); await rm(dir, { recursive: true }); }
});


test.each(['fee', 'unknown-keyset', 'denomination', 'signature', 'dleq', 'spent'] as const)(
  'real Coco rejects %s without granting access or retaining extra funds', async (scenario) => {
    const dir = await mkdtemp('/tmp/coco-rejection-');
    const mint = startFakeMint({ fee: scenario === 'fee' ? 100 : 0 });
    const settlement = await openCocoSettlement({ databasePath: `${dir}/coco.sqlite`, mint: mint.url, seed: new Uint8Array(64).fill(42) });
    migrateApplication(`${dir}/grants.sqlite`);
    const publisher = startPublisher({ port: 0, databasePath: `${dir}/grants.sqlite`, mint: mint.url, settlement });
    try {
      const { seed } = await readerFromPasskey(new Uint8Array(32).fill(1));
      const publicKey = deriveArticleKey(seed, 'the-quiet-web').publicKey;
      const issued = mint.issue(32);
      const input = {
        ...issued,
        ...(scenario === 'unknown-keyset' ? { id: '00' + 'ff'.repeat(7) } : {}),
        ...(scenario === 'denomination' ? { amount: 31 } : {}),
        ...(scenario === 'signature' ? { C: mint.issue(32).C } : {}),
        ...(scenario === 'dleq' ? { dleq: { e: '01'.repeat(32), s: '02'.repeat(32), r: '03'.repeat(32) } } : {}),
      };
      const payment = (article: string) => fetch(new URL(`/payment/${article}/${publicKey}`, publisher.url), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mint: mint.url, unit: 'sat', proofs: [input] }),
      });
      if (scenario === 'spent') expect((await payment('the-price-of-a-page')).status).toBe(200);
      expect((await payment('the-quiet-web')).status).toBe(scenario === 'fee' ? 503 :
        ['unknown-keyset', 'denomination'].includes(scenario) ? 400 : 422);
      expect((await settlement.balance()).spendable.toNumber()).toBe(scenario === 'spent' ? 32 : 0);
      expect(mint.received).toBe(scenario === 'spent' ? 32 : 0);
      const unpaid = await fetch(new URL('/article/the-quiet-web', publisher.url), { headers: {
        authorization: signArticleRequest(seed, { articleId: 'the-quiet-web', method: 'GET', path: '/article/the-quiet-web', timestamp: Math.floor(Date.now()/1000) }),
      } });
      expect(unpaid.status).toBe(402);
    } finally { await publisher.stop(); await mint.stop(); await rm(dir, { recursive: true }); }
  },
);
