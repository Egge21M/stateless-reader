import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import { decodePaymentRequest } from '@cashu/cashu-ts';

test.use({ trace: 'off' });
async function pay(page: Page, request: APIRequestContext) {
  const encoded = await page.getByLabel('Payment request', { exact: true }).inputValue();
  const payment = decodePaymentRequest(encoded);
  const token = await request.get(`${payment.mints![0]}/test/issue?amount=${payment.amount!.toNumber()}`);
  const response = await request.post(payment.transport![0]!.target, { data: await token.json() });
  expect(response.status()).toBe(200);
  return payment;
}
test('a purchase automatically opens content, stops polling, and restores in a fresh browser', async ({ page, request, browser }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create reader phrase', exact: true }).click();
  const phrase = await page.getByLabel('Your reader recovery phrase', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'Hide backup' }).click();
  await page.getByRole('button', { name: 'Select The quiet web', exact: true }).click();
  await expect(page.getByLabel('Payment request', { exact: true })).toBeVisible();
  const first = await pay(page, request);
  await expect(page.getByRole('article')).toContainText('A quiet website begins with a stopping point.');
  const requests: string[] = [];
  page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/article/')) requests.push(r.url()); });
  await page.waitForTimeout(1800);
  expect(requests).toEqual([]);
  await expect(page.getByLabel('Payment request', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Select A library in your pocket', exact: true }).click();
  await expect(page.getByLabel('Payment request', { exact: true })).toBeVisible();
  const second = await pay(page, request);
  expect(second.transport![0]!.target.split('/').at(-1)).not.toBe(first.transport![0]!.target.split('/').at(-1));
  await expect(page.getByRole('article')).toContainText('The most useful library is not the largest one.');
  await page.getByRole('button', { name: 'Lock reader', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(0);
  const fresh = await browser.newContext();
  try {
    const restored = await fresh.newPage();
    await restored.goto('/');
    await restored.getByLabel('Restore reader recovery phrase', { exact: true }).fill(phrase);
    await restored.getByRole('button', { name: 'Restore reader', exact: true }).click();
    await expect(restored.getByText('Reader unlocked', { exact: true })).toBeVisible();
    await restored.getByRole('button', { name: 'Select The quiet web', exact: true }).click();
    await expect(restored.getByRole('article')).toContainText('A quiet website begins with a stopping point.');
    await expect(restored.getByLabel('Payment request', { exact: true })).toHaveCount(0);
  } finally { await fresh.close(); }
});

test('polls use fresh signed requests only while open and closing does not cancel a wallet payment', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create reader phrase', exact: true }).click();
  await page.getByRole('button', { name: 'Hide backup' }).click();
  const authorizations: string[] = [];
  page.on('request', r => {
    if (new URL(r.url()).pathname === '/article/the-quiet-web') authorizations.push(r.headers()['authorization']);
  });
  await page.getByRole('button', { name: 'Select The quiet web', exact: true }).click();
  await expect(page.getByLabel('Payment request', { exact: true })).toBeVisible();
  const payment = decodePaymentRequest(await page.getByLabel('Payment request', { exact: true }).inputValue());
  await expect.poll(() => new Set(authorizations).size).toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: 'Close payment panel', exact: true }).click();
  const count = authorizations.length;
  await page.waitForTimeout(1800);
  expect(authorizations).toHaveLength(count);
  const token = await request.get(`${payment.mints![0]}/test/issue?amount=21`);
  expect((await request.post(payment.transport![0]!.target, { data: await token.json() })).status()).toBe(200);
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.getByRole('button', { name: 'Check article access', exact: true }).click();
  await expect(page.getByRole('article')).toContainText('A quiet website begins with a stopping point.');
  await page.getByRole('button', { name: 'Select A library in your pocket', exact: true }).click();
  await expect(page.getByLabel('Payment request', { exact: true })).toBeVisible();
  const afterLock: string[] = [];
  await page.getByRole('button', { name: 'Lock reader', exact: true }).click();
  page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/article/')) afterLock.push(r.url()); });
  await page.waitForTimeout(1800);
  expect(afterLock).toEqual([]);
});

for (const action of ['lock', 'restore', 'select another', 'close'] as const) {
  test(`a delayed paid poll cannot restore content after ${action}`, async ({ page, request }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Create reader phrase', exact: true }).click();
    await page.getByRole('button', { name: 'Hide backup' }).click();
    await page.getByRole('button', { name: 'Select The quiet web', exact: true }).click();
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
      if (action === 'lock') await page.getByRole('button', { name: 'Lock reader', exact: true }).click();
      if (action === 'close') await page.getByRole('button', { name: 'Close payment panel', exact: true }).click();
      if (action === 'select another') await page.getByRole('button', { name: 'Select A library in your pocket', exact: true }).click();
      if (action === 'restore') {
        await page.getByLabel('Restore reader recovery phrase', { exact: true }).fill('abandon '.repeat(11) + 'about');
        await page.getByRole('button', { name: 'Restore reader', exact: true }).click();
        await expect(page.getByText('Reader unlocked', { exact: true })).toBeVisible();
      }
    } finally { release(); }
    await completed;
    await page.waitForTimeout(100);
    await expect(page.getByRole('article')).toHaveCount(0);
    if (action === 'close' || action === 'lock') await expect(page.getByLabel('Payment request', { exact: true })).toHaveCount(0);
    else await expect(page.getByLabel('Payment request', { exact: true })).toBeVisible();
  });
}
