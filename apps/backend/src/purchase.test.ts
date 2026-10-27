import { afterEach, expect, test, spyOn } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { restoreReader, signArticleRequest, deriveArticleKey } from '@stateless-reader/core';
import { startPublisher } from './app';
import { migrateApplication } from './db/migrate';
import type { Settlement } from './settlement';

const resources: { stop(): Promise<void> }[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(resources.splice(0).map(p => p.stop()));
  await Promise.all(directories.splice(0).map(d => rm(d, { recursive: true })));
});
const articleId = 'the-quiet-web';
const mint = 'https://mint.minibits.cash/Bitcoin';
const { seed } = await restoreReader('abandon '.repeat(11) + 'about');
const publicKey = deriveArticleKey(seed, articleId).publicKey;
const paymentContentTypes = ['application/json', null, 'application/x-www-form-urlencoded'];
const proof = (amount = 32, secret: string = crypto.randomUUID()) => ({
  amount, secret, id: '00107937db0cc865',
  C: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
});
function controlledSettlement() {
  const spent = new Set<string>();
  let balance = 0;
  return {
    get balance() { return balance; },
    async receive(token: Parameters<Settlement['receive']>[0]) {
      if (token.proofs.some(p => spent.has(p.secret) || p.secret === 'invalid-proof')) throw new Error('Rejected proof');
      for (const p of token.proofs) { spent.add(p.secret); balance += p.amount.toNumber(); }
      return { state: 'finalized' };
    },
  };
}
async function harness(settlement: Settlement = controlledSettlement()) {
  const dir = await mkdtemp('/tmp/purchase-'); directories.push(dir);
  migrateApplication(`${dir}/grants.sqlite`);
  const publisher = startPublisher({ port: 0, databasePath: `${dir}/grants.sqlite`,
    settlement,
  });
  resources.push(publisher);
  return { ...publisher, databasePath: `${dir}/grants.sqlite` };
}
function read(url: URL, id = articleId, readerSeed = seed) {
  const path = `/article/${id}`;
  return fetch(new URL(path, url), { headers: { authorization: signArticleRequest(readerSeed, {
    articleId: id, method: 'GET', path, timestamp: Math.floor(Date.now()/1000),
  }) } });
}
function pay(url: URL, proofs = [proof()], id = articleId, key = publicKey) {
  return fetch(new URL(`/payment/${id}/${key}`, url), { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mint, unit: 'sat', proofs }),
  });
}
test('a settled payment unlocks only its signed article and reader key', async () => {
  const publisher = await harness();
  expect((await read(publisher.url)).status).toBe(402);
  const payment = await pay(publisher.url);
  expect(payment.status).toBe(200);
  expect(await payment.json()).toEqual({ status: 'paid', articleId, publicKey, protocolVersion: 1 });
  const content = await read(publisher.url);
  expect(content.status).toBe(200);
  expect(content.headers.get('cache-control')).toBe('no-store');
  expect((await content.json() as { body: string }).body).toContain('A quiet website begins with a stopping point.');
  expect((await read(publisher.url, 'a-library-in-your-pocket')).status).toBe(402);
  const other = await restoreReader('legal winner thank year wave sausage worth useful legal winner thank yellow');
  expect((await read(publisher.url, articleId, other.seed)).status).toBe(402);
  expect((await fetch(new URL(`/article/${articleId}`, publisher.url))).status).toBe(401);
});

test.each(paymentContentTypes)('JSON payment with Content-Type %s unlocks after settlement', async (contentType) => {
  let finalized = false;
  const wallet = controlledSettlement();
  const publisher = await harness({ async receive(token) {
    return finalized ? wallet.receive(token) : { state: 'prepared' };
  } });
  expect((await read(publisher.url)).status).toBe(402);
  const headers = new Headers();
  if (contentType) headers.set('Content-Type', contentType);
  const request = () => new Request(new URL(`/payment/${articleId}/${publicKey}`, publisher.url).href, {
    method: 'POST', headers,
    // Bytes avoid fetch silently supplying text/plain for a string body.
    body: new TextEncoder().encode(JSON.stringify({ mint, unit: 'sat', proofs: [proof(32, 'synthetic-header-regression')] })),
  });
  expect(request().headers.get('content-type')).toBe(contentType ?? null);
  const unsettled = await fetch(request());
  expect(unsettled.status).toBe(422);
  expect((await read(publisher.url)).status).toBe(402);
  finalized = true;
  const response = await fetch(request());
  expect(response.status).toBe(200);
  expect(response.headers.get('access-control-allow-origin')).toBe('*');
  expect(await response.json()).toEqual({ status: 'paid', articleId, publicKey, protocolVersion: 1 });
  expect((await read(publisher.url)).status).toBe(200);
});

test.each(paymentContentTypes)('invalid NUT-18 requests with Content-Type %s reject before consuming any submitted ecash', async (contentType) => {
  const publisher = await harness();
  const validProof = proof();
  const valid = { mint, unit: 'sat', proofs: [validProof] };
  const cases: [string, unknown, number][] = [
    ['', { ...valid, mint: 'https://untrusted.invalid' }, 400],
    ['', { ...valid, unit: 'usd' }, 400],
    ['', { ...valid, proofs: [proof(16)] }, 400],
    ['', { ...valid, proofs: [] }, 400],
    ['', { ...valid, proofs: [{ ...validProof, amount: '32' }] }, 400],
    ['', { ...valid, proofs: [{ ...validProof, amount: 0 }] }, 400],
    ['', { ...valid, proofs: [{ ...validProof, amount: -1 }] }, 400],
    ['', { ...valid, proofs: [{ ...validProof, amount: 1.5 }] }, 400],
    ['', { ...valid, proofs: [{ ...validProof, amount: Number.MAX_SAFE_INTEGER + 1 }] }, 400],
    ['', { ...valid, proofs: [{ ...validProof, amount: Number.MAX_SAFE_INTEGER }, proof(1)] }, 400],
    ['', { ...valid, proofs: [validProof, validProof] }, 400],
    ['', { ...valid, proofs: [{ ...validProof, C: 'not-a-point' }] }, 400],
    ['', { ...valid, proofs: [{ ...validProof, C: '02' + 'ff'.repeat(32) }] }, 400],
    ['', { ...valid, proofs: [{ ...validProof, id: 'unknown' }] }, 400],
    ['', { ...valid, proofs: [{ ...validProof, secret: '' }] }, 400],
    ['', { ...valid, proofs: [{ ...validProof, witness: {} }] }, 400],
    ['', { ...valid, proofs: [{ ...validProof, dleq: { e: 'bad' } }] }, 400],
    ['', { ...valid, memo: false }, 400],
    ['', { ...valid, id: 4 }, 400],
    ['', null, 400], ['', [], 400], ['', 'cashuBtoken', 400],
    [`/payment/missing/${publicKey}`, valid, 404],
    [`/payment/${articleId}/garbage`, valid, 400],
    [`/payment/${articleId}/${'00'.repeat(32)}`, valid, 400],
  ];
  for (const [path, payload, status] of cases) {
    const response = await fetch(new URL(path || `/payment/${articleId}/${publicKey}`, publisher.url), {
      method: 'POST', headers: { ...(contentType ? { 'Content-Type': contentType } : {}), Origin: 'https://wallet.example' },
      body: new TextEncoder().encode(JSON.stringify(payload)),
    });
    expect(response.status).toBe(status);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect((await response.json() as { error: string }).error).toBeString();
    expect((await read(publisher.url)).status).toBe(402);
  }
  expect((await pay(publisher.url, [validProof])).status).toBe(200);
});

test.each(paymentContentTypes)('Content-Type %s still requires JSON and caps streamed bodies at 128 KiB', async (contentType) => {
  const publisher = await harness();
  const url = new URL(`/payment/${articleId}/${publicKey}`, publisher.url);
  const headers = new Headers();
  if (contentType) headers.set('Content-Type', contentType);
  for (const body of ['{', 'mint=https%3A%2F%2Fmint.minibits.cash%2FBitcoin&unit=sat&proofs=%5B%5D']) {
    const response = await fetch(url, { method: 'POST', headers, body: new TextEncoder().encode(body) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid payment JSON' });
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect((await read(publisher.url)).status).toBe(402);
  }
  const payload = { mint, unit: 'sat', proofs: [proof()], memo: '' };
  const empty = JSON.stringify(payload);
  const exactLimit = new TextEncoder().encode(JSON.stringify({ ...payload, memo: 'x'.repeat(128 * 1024 - empty.length) }));
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(exactLimit);
    controller.enqueue(new TextEncoder().encode(' '));
    controller.close();
  } });
  // Do not reuse a connection whose oversized chunked upload is cancelled.
  const streamHeaders = new Headers(headers);
  streamHeaders.set('Connection', 'close');
  const request = new Request(url.href, { method: 'POST', headers: streamHeaders, body: stream });
  expect(request.headers.get('content-length')).toBeNull();
  const oversized = await fetch(request);
  expect(oversized.status).toBe(413);
  expect(await oversized.json()).toEqual({ error: 'Payment payload too large' });
  expect(oversized.headers.get('access-control-allow-origin')).toBe('*');
  expect((await read(publisher.url)).status).toBe(402);
  // The exact limit remains valid, and the rejected body consumed no proofs.
  expect((await fetch(url, { method: 'POST', headers, body: exactLimit })).status).toBe(200);
  expect((await read(publisher.url)).status).toBe(200);
});

test('unrecognized payment media types reject even valid JSON without consuming proofs', async () => {
  const publisher = await harness();
  const validProof = proof();
  for (const contentType of ['text/plain', 'application/octet-stream', 'multipart/form-data', 'application/jsonp']) {
    const response = await fetch(new URL(`/payment/${articleId}/${publicKey}`, publisher.url), {
      method: 'POST', headers: { 'Content-Type': contentType },
      body: JSON.stringify({ mint, unit: 'sat', proofs: [validProof] }),
    });
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: 'Unsupported payment Content-Type; send application/json' });
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect((await read(publisher.url)).status).toBe(402);
  }
  expect((await pay(publisher.url, [validProof])).status).toBe(200);
});


test('duplicate and concurrent purchases reject without consuming the losing proofs', async () => {
  const wallet = controlledSettlement();
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const publisher = await harness({ async receive(token) { entered(); await gate; return wallet.receive(token); } });
  const first = proof(), second = proof();
  const firstRequest = pay(publisher.url, [first]);
  await started;
  expect((await read(publisher.url)).status).toBe(402);
  const secondRequest = pay(publisher.url, [second]);
  // Keep the first settlement pending while the second HTTP request is in flight.
  await Bun.sleep(25);
  release();
  const responses = await Promise.all([firstRequest, secondRequest]);
  expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
  expect(wallet.balance).toBe(32);
  const fresh = proof();
  expect((await pay(publisher.url, [fresh])).status).toBe(409);
  expect(wallet.balance).toBe(32);
  // Both rejected submissions remain usable for other article/key pairs.
  expect((await pay(publisher.url, [second], 'the-price-of-a-page')).status).toBe(200);
  expect((await pay(publisher.url, [fresh], articleId, deriveArticleKey(seed, 'other-key').publicKey)).status).toBe(200);
  expect(wallet.balance).toBe(96);
});

test('shutdown drains a pending payment before closing its wallet and database', async () => {
  let release!: () => void;
  let entered!: () => void;
  let closed = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const publisher = await harness({
    async receive() { entered(); await gate; expect(closed).toBe(false); return { state: 'finalized' }; },
    async close() { closed = true; },
  });
  const payment = pay(publisher.url);
  await started;
  const stopping = publisher.stop();
  expect(closed).toBe(false);
  release();
  expect((await payment).status).toBe(200);
  await stopping;
  expect(closed).toBe(true);
});


test('underpayment is unspent, exact and excess amounts are retained, and malformed HTTP is JSON with CORS', async () => {
  const wallet = controlledSettlement();
  const publisher = await harness(wallet);
  const small = proof(16);
  expect((await pay(publisher.url, [small])).status).toBe(400);
  expect(wallet.balance).toBe(0);
  expect((await pay(publisher.url, [small, proof(4), proof(1)])).status).toBe(200);
  expect(wallet.balance).toBe(21);
  expect((await pay(publisher.url, [proof(32)], 'the-price-of-a-page')).status).toBe(200);
  expect(wallet.balance).toBe(53);
  const url = new URL(`/payment/${articleId}/${publicKey}`, publisher.url);
  const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://wallet.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
  expect(preflight.headers.get('access-control-allow-headers')).toBe('Content-Type');
  expect(preflight.headers.get('access-control-allow-origin')).toBe('*');
  for (const [body, contentType, status] of [
    ['{', 'application/json', 400], ['{}', 'text/plain', 415],
    [JSON.stringify({ memo: 'x'.repeat(129 * 1024) }), 'application/json', 413],
  ] as const) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': contentType }, body });
    expect(response.status).toBe(status);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toHaveProperty('error');
  }
});

test('preparation, failed settlement, invalid and spent proofs never grant access', async () => {
  for (const state of ['prepared', 'executing', 'rolled_back']) {
    const publisher = await harness({ async receive() { return { state }; } });
    expect((await pay(publisher.url)).status).toBe(422);
    expect((await read(publisher.url)).status).toBe(402);
  }
  const wallet = controlledSettlement();
  const publisher = await harness(wallet);
  expect((await pay(publisher.url, [proof(32, 'invalid-proof')])).status).toBe(422);
  expect((await read(publisher.url)).status).toBe(402);
  const spent = proof(32);
  expect((await pay(publisher.url, [spent], 'the-price-of-a-page')).status).toBe(200);
  expect((await pay(publisher.url, [spent])).status).toBe(422);
  expect((await read(publisher.url)).status).toBe(402);
  expect(wallet.balance).toBe(32);
});

test('completed grants survive reopening the application database and still reject duplicates', async () => {
  const wallet = controlledSettlement();
  const publisher = await harness(wallet);
  expect((await pay(publisher.url)).status).toBe(200);
  await publisher.stop();
  const restarted = startPublisher({ port: 0, databasePath: publisher.databasePath, settlement: wallet });
  resources.push(restarted);
  expect((await read(restarted.url)).status).toBe(200);
  expect((await pay(restarted.url)).status).toBe(409);
  expect(wallet.balance).toBe(32);
});

test('an existing grant repeatedly opens a corrected article years later without another payment', async () => {
  const publisher = await harness();
  expect((await pay(publisher.url)).status).toBe(200);
  expect((await read(publisher.url)).status).toBe(200);
  await publisher.stop();

  const correction = {
    id: articleId, title: 'The quiet web — corrected',
    preview: 'Updated notes on places to read.',
    offer: { amount: 21, unit: 'sat', mint },
    body: 'Correction: a quiet website can offer navigation without an endless feed.',
  };
  // A new fixture edition is deployed with the same identity and grant database.
  // No settlement adapter is needed to read an existing purchase.
  const restarted = startPublisher({ port: 0, databasePath: publisher.databasePath, articles: [correction] });
  resources.push(restarted);
  const clock = spyOn(Date, 'now').mockReturnValue(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
  try {
    for (let visit = 0; visit < 3; visit++) {
      const content = await read(restarted.url);
      expect(content.status).toBe(200);
      expect(await content.json()).toEqual({ articleId, publicKey, protocolVersion: 1,
        title: correction.title, body: correction.body });
    }
    const catalogue = await fetch(new URL('/articles', restarted.url));
    expect(await catalogue.json()).toEqual({ articles: [{ id: articleId,
      title: correction.title, preview: correction.preview, offer: correction.offer }] });
  } finally { clock.mockRestore(); }
});


test('a wallet disconnect cannot make shutdown abandon its accepted settlement', async () => {
  let entered!: () => void;
  let release!: () => void;
  let closed = false;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const publisher = await harness({
    async receive() { entered(); await gate; expect(closed).toBe(false); return { state: 'finalized' }; },
    async close() { closed = true; },
  });
  const controller = new AbortController();
  const payment = fetch(new URL(`/payment/${articleId}/${publicKey}`, publisher.url), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mint, unit: 'sat', proofs: [proof()] }), signal: controller.signal,
  }).catch(() => undefined);
  await started;
  controller.abort();
  await payment;
  const stopping = publisher.stop();
  expect(closed).toBe(false);
  release();
  await stopping;
  expect(closed).toBe(true);
  const reopened = startPublisher({ port: 0, databasePath: publisher.databasePath });
  resources.push(reopened);
  expect((await read(reopened.url)).status).toBe(200);
});
