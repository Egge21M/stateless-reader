import {
  createNewMintKeys, serializeMintKeys, hashToCurve, pointFromHex,
  createDLEQProof, verifyUnblindedSignature,
} from '@cashu/cashu-ts';
import { secp256k1 } from '@noble/curves/secp256k1.js';

/** Deterministic, valueless mint. Only the external mint is substituted; Coco is real. */
export function startFakeMint({ fee = 0, inactiveInput = false } = {}) {
  const keys = createNewMintKeys(16, new Uint8Array(64).fill(7), { unit: 'sat', input_fee_ppk: fee, versionByte: 1 });
  const id = keys.keysetId;
  const inputKeys = inactiveInput
    ? createNewMintKeys(16, new Uint8Array(64).fill(8), { unit: 'sat', input_fee_ppk: fee, versionByte: 0 })
    : keys;
  const keysets = inactiveInput ? [keys, inputKeys] : [keys];
  const metadata = (k: typeof keys) => ({ id: k.keysetId, unit: 'sat', active: k === keys, input_fee_ppk: fee });
  const spent = new Set<string>();
  const restored = new Map<string, { output: unknown; signature: unknown }>();
  let received = 0;
  const point = (secret: string) => hashToCurve(new TextEncoder().encode(secret));
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request): Promise<Response> {
    const path = new URL(request.url).pathname;
    const json = Response.json;
    if (path === '/v1/info') return json({ name: 'Valueless test mint', version: 'test/1', nuts: {
      '4': { methods: [], disabled: true }, '5': { methods: [], disabled: true },
      '7': { supported: true }, '9': { supported: true }, '12': { supported: true },
    } });
    if (path === '/v1/keysets') return json({ keysets: keysets.map(metadata) });
    if (path.startsWith('/v1/keys')) return json({ keysets: keysets.filter(k => path === '/v1/keys' ? k === keys : path.endsWith('/' + k.keysetId)).map(k => ({ ...metadata(k), keys: serializeMintKeys(k.pubKeys) })) });
    if (path === '/test/issue') {
      const amount = Number(new URL(request.url).searchParams.get('amount'));
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 65535) return json({ error: 'Invalid test amount' }, { status: 400 });
      const proofs = [];
      for (let denomination = 1; denomination <= amount; denomination *= 2) {
        if (!(amount & denomination)) continue;
        const secret = crypto.randomUUID();
        proofs.push({ amount: denomination, id: inputKeys.keysetId, secret, C: point(secret).multiply(secp256k1.Point.Fn.fromBytes(inputKeys.privKeys[String(denomination)]!)).toHex(true) });
      }
      return json({ mint: server.url.origin, unit: 'sat', proofs });
    }
    const data = await request.json() as {
      Ys: string[];
      inputs: { id: string; amount: number; secret: string; C: string }[];
      outputs: { B_: string; amount: number }[];
    };
    if (path === '/v1/checkstate') return json({ states: data.Ys.map((Y: string) => ({ Y, state: spent.has(Y) ? 'SPENT' : 'UNSPENT' })) });
    if (path === '/v1/restore') {
      const matches = data.outputs.flatMap((o: { B_: string }) => restored.has(o.B_) ? [restored.get(o.B_)!] : []);
      return json({ outputs: matches.map((m: { output: unknown }) => m.output), signatures: matches.map((m: { signature: unknown }) => m.signature) });
    }
    if (path === '/v1/swap') {
      const seen = new Set<string>();
      for (const p of data.inputs) {
        const Y = point(p.secret).toHex(true);
        if (spent.has(Y) || seen.has(Y)) return json({ code: 11001, detail: 'Token already spent' }, { status: 400 });
        seen.add(Y);
        const signingKeys = keysets.find(k => k.keysetId === p.id);
        if (!signingKeys?.privKeys[String(p.amount)] || !verifyUnblindedSignature({ id: p.id, secret: new TextEncoder().encode(p.secret), C: pointFromHex(p.C) }, signingKeys.privKeys[String(p.amount)]!)) {
          return json({ code: 10002, detail: 'Invalid proof' }, { status: 400 });
        }
      }
      const input = data.inputs.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
      const output = data.outputs.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
      if (input !== output) return json({ code: 10002, detail: 'Unbalanced swap' }, { status: 400 });
      const signatures = data.outputs.map((o: { B_: string; amount: number }) => {
        const B = pointFromHex(o.B_), a = keys.privKeys[String(o.amount)]!;
        const d = createDLEQProof(B, a);
        const signature = { id, amount: o.amount, C_: B.multiply(secp256k1.Point.Fn.fromBytes(a)).toHex(true),
          dleq: { e: Buffer.from(d.e).toString('hex'), s: Buffer.from(d.s).toString('hex') } };
        restored.set(o.B_, { output: o, signature });
        return signature;
      });
      for (const p of data.inputs) spent.add(point(p.secret).toHex(true));
      received += input;
      return json({ signatures });
    }
    return json({ error: 'Unexpected test-mint request' }, { status: 404 });
  } });
  return {
    url: server.url.origin,
    get received() { return received; },
    issue(amount: number, secret = crypto.randomUUID()) {
      return { amount, id: inputKeys.keysetId, secret, C: point(secret).multiply(secp256k1.Point.Fn.fromBytes(inputKeys.privKeys[String(amount)]!)).toHex(true) };
    },
    async stop() { await server.stop(true); },
  };
}
