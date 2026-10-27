import { openProfile, unlockReader, closeProfile, closeDialog, lockReader, selectArticle } from "./reader-journey";
import { expect, test, type Page, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { decodePaymentRequest } from '@cashu/cashu-ts';
import { readerFromPasskey, deriveArticleKey } from '../../packages/core/src/index';

test.use({ trace: 'off' });
async function pay(page: Page, request: APIRequestContext) {
  const encoded = await page.getByLabel('Payment request', { exact: true }).inputValue();
  const payment = decodePaymentRequest(encoded);
  const token = await request.get(`${payment.mints![0]}/test/issue?amount=${payment.amount!.toNumber()}`);
  const response = await request.post(payment.transport![0]!.target, { data: await token.json() });
  expect(response.status()).toBe(200);
  return payment;
}
// Observe browser boundaries throughout the journey, including before restoration.
function observeReader(context: BrowserContext) {
  const traffic: string[] = [];
  const logs: string[] = [];
  const articles: { path: string; key: string | undefined }[] = [];
  const payments: string[] = [];
  context.on('request', request => {
    traffic.push(request.url(), JSON.stringify(request.headers()), request.postData() ?? '');
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/payment/')) payments.push(path);
    if (path.startsWith('/article/')) articles.push({ path,
      key: request.headers()['authorization']?.split(' ')[1]?.split('.')[0] });
  });
  context.on('console', message => logs.push(message.text()));
  return {
    articles,
    payments,
    async assertPrivate(page: Page, secrets: string[]) {
      const emptyStorage = await page.evaluate(async () =>
        localStorage.length === 0 && sessionStorage.length === 0 &&
        (await indexedDB.databases()).length === 0 && (await caches.keys()).length === 0);
      // Boolean assertions avoid printing a leaked secret in failure output.
      expect(emptyStorage, 'No persistent reader storage').toBe(true);
      expect((await context.cookies()).length, 'No reader cookies').toBe(0);
      expect(secrets.some(secret => traffic.some(entry => entry.includes(secret))), 'No reader secrets in requests').toBe(false);
      expect(secrets.some(secret => logs.some(entry => entry.includes(secret))), 'No reader secrets in console output').toBe(false);
    },
  };
}

async function secretEncodings(prf: number[]) {
  const { seed } = await readerFromPasskey(new Uint8Array(prf));
  const keys = ['the-quiet-web', 'a-library-in-your-pocket'].map(id => deriveArticleKey(seed, id).privateKey);
  const encodings: string[] = [];
  for (const bytes of [new Uint8Array(prf), seed, ...keys]) {
    encodings.push(Buffer.from(bytes).toString('hex'), Buffer.from(bytes).toString('base64'),
      JSON.stringify([...bytes]), JSON.stringify(bytes));
    bytes.fill(0);
  }
  return encodings;
}

test('two independent purchases restore on demand with one passkey and no persistent app credentials', async ({ page, context, request, browser }) => {
  const audit = observeReader(context);
  await page.goto('/');
  await openProfile(page);
  const prf = await unlockReader(page);
  const secrets = await secretEncodings(prf);
  await audit.assertPrivate(page, secrets);
  const purchases = [
    { id: 'the-quiet-web', title: 'The quiet web', passage: 'A quiet website begins with a stopping point.' },
    { id: 'a-library-in-your-pocket', title: 'A library in your pocket', passage: 'The most useful library is not the largest one.' },
  ];
  const keys: string[] = [];
  for (const article of purchases) {
    const response = page.waitForResponse(r => new URL(r.url()).pathname === `/article/${article.id}`);
    await selectArticle(page, article.title);
    // The second article still requires its own payment after the first is bought.
    expect((await response).status()).toBe(402);
    await expect(page.getByLabel('Payment request', { exact: true })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
    await audit.assertPrivate(page, secrets);
    const payment = await pay(page, request);
    keys.push(payment.transport![0]!.target.split('/').at(-1)!);
    await expect(page.getByRole('article')).toContainText(article.passage);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Selected article' }).getByRole('heading', { name: article.title, exact: true })).toBeFocused();
    await expect(page.getByLabel('Payment request', { exact: true })).toHaveCount(0);
    await audit.assertPrivate(page, secrets);
  }
  expect(keys[0]).not.toBe(keys[1]);
  const readCount = audit.articles.length;
  await page.waitForTimeout(1800);
  expect(audit.articles).toHaveLength(readCount);

  await lockReader(page);
  await expect(page.getByRole('article')).toHaveCount(0);
  await selectArticle(page, "The quiet web");
  await openProfile(page);
  await expect(page.getByText('Reader locked', { exact: true })).toBeVisible();
  await page.waitForTimeout(1800);
  expect(audit.articles).toHaveLength(readCount);
  await audit.assertPrivate(page, secrets);

  const fresh = await browser.newContext();
  const restoredAudit = observeReader(fresh);
  try {
    const restored = await fresh.newPage();
    await restored.goto('/');
    await openProfile(restored);
    await unlockReader(restored, prf);
    await restored.waitForTimeout(1800);
    expect(restoredAudit.articles).toEqual([]);
    await restoredAudit.assertPrivate(restored, secrets);
    // Repeat visits exercise both grants with the recreated article keys, without any payment POST.
    for (let visit = 0; visit < 2; visit++) {
      for (const [index, article] of purchases.entries()) {
        const before = restoredAudit.articles.length;
        const response = restored.waitForResponse(r => new URL(r.url()).pathname === `/article/${article.id}`);
        await selectArticle(restored, article.title);
        expect((await response).status()).toBe(200);
        await expect(restored.getByRole('article')).toContainText(article.passage);
        await expect(restored.getByLabel('Payment request', { exact: true })).toHaveCount(0);
        const opened = restoredAudit.articles.slice(before);
        expect(opened.length).toBeGreaterThan(0);
        // Development StrictMode can repeat a request; only this article/key may be checked.
        for (const access of opened) expect(access).toEqual({ path: `/article/${article.id}`, key: keys[index] });
        await restoredAudit.assertPrivate(restored, secrets);
      }
    }
    expect(restoredAudit.payments).toEqual([]);
    // Reload a paid, unlocked tab: there must be no hidden credential that can reopen it.
    await restored.reload();
    await openProfile(restored);
    await expect(restored.getByText('Reader locked', { exact: true })).toBeVisible();
    const beforeReloadSelection = restoredAudit.articles.length;
    await selectArticle(restored, "A library in your pocket");
    await restored.waitForTimeout(1800);
    await expect(restored.getByRole('article')).toHaveCount(0);
    await expect(restored.getByLabel('Payment request', { exact: true })).toHaveCount(0);
    expect(restoredAudit.articles).toHaveLength(beforeReloadSelection);
    await restoredAudit.assertPrivate(restored, secrets);

    // An unrelated freshly generated reader inherits neither purchase.
    await closeDialog(restored);
    await restored.getByRole('button', { name: 'Clear selection', exact: true }).click();
    await openProfile(restored);
    const unrelated = await unlockReader(restored);
    secrets.push(...await secretEncodings(unrelated));
    for (const [index, article] of purchases.entries()) {
      const response = restored.waitForResponse(r => new URL(r.url()).pathname === `/article/${article.id}`);
      await selectArticle(restored, article.title);
      expect((await response).status()).toBe(402);
      await expect(restored.getByLabel('Payment request', { exact: true })).toBeVisible();
      expect(restoredAudit.articles.at(-1)?.key).not.toBe(keys[index]);
      await expect(restored.getByRole('article')).toHaveCount(0);
      await restoredAudit.assertPrivate(restored, secrets);
    }
  } finally { await fresh.close(); }
});

test('polls use fresh signed requests only while open and closing does not cancel a wallet payment', async ({ page, request }) => {
  await page.goto('/');
  await openProfile(page);
  await unlockReader(page);
  const authorizations: string[] = [];
  page.on('request', r => {
    if (new URL(r.url()).pathname === '/article/the-quiet-web') authorizations.push(r.headers()['authorization']);
  });
  await selectArticle(page, "The quiet web");
  await expect(page.getByLabel('Payment request', { exact: true })).toBeVisible();
  const payment = decodePaymentRequest(await page.getByLabel('Payment request', { exact: true }).inputValue());
  await expect.poll(() => new Set(authorizations).size).toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: 'Close payment dialog', exact: true }).click();
  const count = authorizations.length;
  await page.waitForTimeout(1800);
  expect(authorizations).toHaveLength(count);
  const token = await request.get(`${payment.mints![0]}/test/issue?amount=21`);
  expect((await request.post(payment.transport![0]!.target, { data: await token.json() })).status()).toBe(200);
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.getByRole('button', { name: 'Check article access', exact: true }).click();
  await expect(page.getByRole('article')).toContainText('A quiet website begins with a stopping point.');
  await expect(page.getByRole('region', { name: 'Selected article' }).getByRole('heading', { name: 'The quiet web', exact: true })).toBeFocused();
  await selectArticle(page, "A library in your pocket");
  await expect(page.getByLabel('Payment request', { exact: true })).toBeVisible();
  const afterLock: string[] = [];
  await lockReader(page);
  page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/article/')) afterLock.push(r.url()); });
  await page.waitForTimeout(1800);
  expect(afterLock).toEqual([]);
});

for (const action of ['lock', 'replace reader', 'select another', 'close'] as const) {
  test(`a delayed paid poll cannot restore content after ${action}`, async ({ page, request }) => {
    await page.goto('/');
    await openProfile(page);
    await unlockReader(page);
    await selectArticle(page, "The quiet web");
    await expect(page.getByLabel('Payment request', { exact: true })).toBeVisible();
    let release!: () => void;
    let received!: () => void;
    let finished!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const requested = new Promise<void>(resolve => { received = resolve; });
    const completed = new Promise<void>(resolve => { finished = resolve; });
    // Delay the real HTTP response only; authentication, payment and grants remain real.
    await page.route('**/article/the-quiet-web', async route => {
      const response = await route.fetch();
      if (response.status() === 200) { received(); await pending; }
      try { await route.fulfill({ response }); } finally { if (response.status() === 200) finished(); }
    });
    await pay(page, request);
    await requested;
    try {
      if (action === 'lock') await lockReader(page);
      if (action === 'close') await page.getByRole('button', { name: 'Close payment dialog', exact: true }).click();
      if (action === 'select another') await selectArticle(page, "A library in your pocket");
      if (action === 'replace reader') {
        await openProfile(page);
        await unlockReader(page);
        await closeProfile(page);
      }
    } finally { release(); }
    await completed;
    await page.waitForTimeout(100);
    await expect(page.getByRole('article')).toHaveCount(0);
    if (action === 'close' || action === 'lock') await expect(page.getByLabel('Payment request', { exact: true })).toHaveCount(0);
    else await expect(page.getByLabel('Payment request', { exact: true })).toBeVisible();
  });
}
