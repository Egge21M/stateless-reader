# CDK interoperability regression evidence

Validated locally on 2026-10-27 from integration base
`e8ebcb73a2b7c1d61cf280567d730be7ba565702`. This addresses two reproduced
serialization/validation incompatibilities in ongoing #7. It does not establish
the cause of the user's Cashu.me delivery failure or complete the funded demo.

## Changes and red/green evidence

The publisher still uses `@cashu/cashu-ts 5.0.0-rc.4` to produce ordinary CBOR
`creqA` requests, URL-safe base64, and the documented POST transport. That pinned
encoder always includes the transport `g` member. Without explicit `tags`, its
value is CBOR undefined (`f7`). Supplying `tags: []` emits an empty array (`80`),
which CDK 0.17.7 accepts. No custom encoder or dependency change is needed.

CDK's `PaymentRequestPayload` serializes absent `id` and `memo` as JSON null.
The publisher now treats either null optional metadata field like omission;
strings remain accepted, while booleans, numbers, arrays and objects still fail.
Mint/unit matching, proof validation, media-type compatibility, body limits,
settlement and access-grant rules are unchanged.

At the approved public HTTP seam:

- `bun test apps/backend/src/purchase.test.ts -t 'optional NUT-18 metadata'`
  initially failed all three null cases (400 instead of 422), while omission
  and strings passed. After the fix all six cases pass. A prepared payment
  leaves signed article reads at 402; only finalized settlement enables 200.
- `bun test apps/backend/src/app.test.ts -t 'an unpaid signed article'`
  initially failed with undefined transport tags; after the fix it passes.
- Existing invalid-payload tests additionally cover wrong metadata types paired
  with null, plus null proof witness/DLEQ. They retain 400, leave reads at 402,
  and allow the same unconsumed proof in a subsequent valid payment. These
  controls run with JSON, absent and form-default Content-Type headers.

## Independent parser and actual HTTP client

The retained external reproduction is:

```sh
python3 /tmp/stateless-reader-implementation/cdk-debug/run.py --require-compatible
```

Only `server.ts` imports were redirected from the integration checkout to this
isolated worktree. No parser, sender, expected status or request-byte rewriting
was changed. With the original worktree code the command exited 1:

```text
REPRODUCED: CDK 0.17.7 app request decode fails; omitted/empty g passes
REPRODUCED: CDK 0.18.2 HTTP nullable payload stops at 400, before disabled settlement
FAIL compatibility requirement
```

With the fixes it exits 0 (`PASS compatibility requirement`). The harness obtains
a fresh signed HTTP 402 from the real publisher on every run and passes that
unmodified `paymentRequest` to both checksum-verified release CLIs' `decode-request`
commands. Both exit 0. It also decodes the same CBOR independently with Rust
`ciborium`; transport `g` is `[]`, amount is 21, mint/unit are unchanged, and the
target is bound to the test reader's article key. This is additional to the
cashu-ts decoding in the HTTP regression, not just an encoder self-roundtrip.

The compiled CDK 0.18.2 probe uses the released `PaymentRequestPayload` type and
`cdk_http_client::HttpClient` with `.post(...).json(&payload).send()`, matching the
wallet's sender chain. Both null fields now reach 503 `Payments unavailable`,
the deliberately absent settlement dependency. Omitted, id-null-only,
memo-null-only and both-null controls all reach the same boundary. **503 is not
delivery/payment success:** it proves validation passed without contacting a
mint or creating a grant. Real wallet preparation/spending is not exercised.

[cdk-interop.json](cdk-interop.json) retains the actual generated 402, independent
decoded CBOR, parser exit statuses, source hashes, actual CDK serialized valueless
payload, HTTP result, and Cashu.me controls. Its loopback port identifies that
recorded run and is not a deployed endpoint. No authorization header or private
reader material is retained. The clearly labeled synthetic proof is valueless.

The temporary harness and its dependencies are session artifacts, not installed
by this repository. To independently replay the retained request using those
release binaries (decode only, no payment):

```python
import json, pathlib, subprocess, tempfile
evidence = json.loads(pathlib.Path('docs/evidence/issue-7/cdk-interop.json').read_text())
request = evidence['generatedHttp402']['paymentRequest']
for version in ['0.17.7', '0.18.2']:
    binary = f'/tmp/stateless-reader-implementation/cdk-debug/cdk-cli-{version}'
    with tempfile.TemporaryDirectory() as work:
        # Public BIP39 vector, never a funded wallet.
        pathlib.Path(work, 'seed').write_text('abandon ' * 11 + 'about')
        subprocess.run([binary, '-w', work, 'decode-request', request], check=True)
```

Pinned provenance from the original researcher, retained in
`/tmp/stateless-reader-implementation/cdk-debug.md` and the sibling harness:

- CDK 0.17.7: `4c5112836aeee22976c562fe71a7008a632dacb0`.
  CLI SHA-256 `c6a2f299904d3ed58908315f893a33cb21e93ce4835152e1e8af1690cbe4159b`.
  [Transport decoding](https://github.com/cashubtc/cdk/blob/4c5112836aeee22976c562fe71a7008a632dacb0/crates/cashu/src/nuts/nut18/transport.rs).
- CDK 0.18.2: `9f6d3a3734d7223d10b5553e3591d3f9d5c6c904`.
  CLI SHA-256 `d1f21147a943e6a856c961c7d5f729173e16cf6ddabc524db227ff73e75dc871`.
  [Payload type](https://github.com/cashubtc/cdk/blob/9f6d3a3734d7223d10b5553e3591d3f9d5c6c904/crates/cashu/src/nuts/nut18/payment_request.rs)
  and [wallet sender](https://github.com/cashubtc/cdk/blob/9f6d3a3734d7223d10b5553e3591d3f9d5c6c904/crates/cdk/src/wallet/payment_request.rs).
  The Rust harness uses unmodified exported source, its retained Cargo.lock, and
  upstream HTTP backend `bitreq 0.3.7`; this is not a byte-identical CLI build claim.
- App encoder: [cashu-ts 5.0.0-rc.4](https://github.com/cashubtc/cashu-ts/blob/v5.0.0-rc.4/src/model/PaymentRequest.ts).

## Cashu.me and remaining limits

The actual extracted Cashu.me 0.3 sender at
`f14b942ea3795a0396ca7ddea19e25a4a7f882be`, with its pinned cashu-ts 4.5.0,
still passes shape validation to disabled settlement with ordinary proofs,
full keyset IDs and a syntactically shaped DLEQ. No proof-rule change is justified
by this evidence. A synthetic trailing-slash mint mismatch still returns 400;
that conditional mismatch is not an established cause of the user's failure.

All proof POSTs in this verification target loopback. No production POST,
funded payment, mint settlement, deployment, issue closure, or production log
inspection was performed. The exact user's Cashu.me/CDK build and failure remain
unconfirmed; live purchase/recovery acceptance remains pending.

## Workspace validation

- `bun install --frozen-lockfile`: passed; no lockfile change.
- `bun run test`: 54 passed, 951 assertions. The initial run alongside workspace
  builds hit two existing one-second CLI startup timeouts (exit 143); running
  the full suite alone passed in 3.32 seconds without changing those tests.
- `bun run typecheck`, `bun run lint`, `bun run build`: all passed.
- `bun run test:browser`: 23 passed.
- `bun run test:browser:production`: 23 passed.
- `git diff --check`: passed.
