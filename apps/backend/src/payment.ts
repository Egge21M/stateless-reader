import { normalizeProofAmounts, type Proof, type Token } from '@cashu/cashu-ts';
import type { ArticleOffer } from '@stateless-reader/core';
import { ed25519 } from '@noble/curves/ed25519.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';

export class PaymentError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export const paymentHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};
export function validPublicKey(key: string) {
  if (!/^[0-9a-f]{64}$/.test(key)) return false;
  try {
    const point = ed25519.Point.fromHex(key, false);
    return !point.isSmallOrder() && point.isTorsionFree();
  } catch { return false; }
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}
const scalar = (value: unknown) => typeof value === 'string' && /^[0-9a-fA-F]{64}$/.test(value);

/** Validate wire shape only; authenticity/spentness still require a successful swap. */
export async function paymentToken(request: Request, offer: ArticleOffer): Promise<Token> {
  const contentType = request.headers.get('content-type');
  const mediaType = contentType?.split(';')[0]?.trim().toLowerCase();
  // Macadamia sends JSON without setting Content-Type; URLSession can supply
  // its form default. Accept that label, but always parse and validate JSON.
  if (contentType !== null && mediaType !== 'application/json' && mediaType !== 'application/x-www-form-urlencoded') {
    throw new PaymentError('Unsupported payment Content-Type; send application/json', 415);
  }
  // Bound streamed as well as Content-Length bodies, before JSON parsing.
  const reader = request.body?.getReader();
  if (!reader) throw new PaymentError('Invalid payment payload');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 128 * 1024) {
        await reader.cancel();
        throw new PaymentError('Payment payload too large', 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let payload: unknown;
  try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new PaymentError('Invalid payment JSON'); }
  // CDK serializes absent optional request metadata as JSON null.
  if (!record(payload) || payload.mint !== offer.mint || payload.unit !== offer.unit ||
      (payload.id != null && typeof payload.id !== 'string') ||
      (payload.memo != null && typeof payload.memo !== 'string') ||
      !Array.isArray(payload.proofs) || payload.proofs.length === 0 || payload.proofs.length > 256) {
    throw new PaymentError('Invalid payment payload or mint/unit');
  }
  const secrets = new Set<string>();
  let amount = 0;
  for (const p of payload.proofs) {
    if (!record(p) || typeof p.amount !== 'number' || !Number.isSafeInteger(p.amount) || p.amount <= 0 ||
        !text(p.id, 66) || !/^(00[0-9a-fA-F]{14}|01[0-9a-fA-F]{64})$/.test(p.id) ||
        !text(p.secret, 4096) || secrets.has(p.secret) ||
        !text(p.C, 66) || !/^0[23][0-9a-fA-F]{64}$/.test(p.C) ||
        (p.witness !== undefined && !text(p.witness, 8192)) ||
        (p.dleq !== undefined && (!record(p.dleq) || !scalar(p.dleq.e) || !scalar(p.dleq.s) || !scalar(p.dleq.r)))) {
      throw new PaymentError('Invalid payment proofs');
    }
    try { secp256k1.Point.fromHex(p.C).assertValidity(); }
    catch { throw new PaymentError('Invalid payment proofs'); }
    secrets.add(p.secret);
    amount += p.amount;
    if (!Number.isSafeInteger(amount)) throw new PaymentError('Invalid payment amount');
  }
  if (amount < offer.amount) throw new PaymentError('Payment below article price');
  return { mint: offer.mint, unit: offer.unit, proofs: normalizeProofAmounts(payload.proofs as Proof[]) };
}
