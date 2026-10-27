# #7 Macadamia Content-Type interoperability fix

Validation date: **2026-10-27 UTC**. Initial integration/worktree HEAD:
`371c69923e4af760f171a0793c0e8ffcc9ce0b94`. Branch:
`fix/headerless-payment-json` (initially `t3/fca3b1f6`).

## Live report and limits

The user confirmed **Macadamia received HTTP 415**. Cashu.me/CDK reportedly showed
a generic payment-delivery failure, which is being investigated separately.
The earlier “it does work” report is partial/ambiguous: no successful wallet,
wallet version, purchase, repeat read, or fresh-browser recovery is established.
The inspected source revision below is not an identified installed wallet build.

This change fixes a reproduced HTTP rejection locally. No production proofs,
spending, deployment, push, or issue closure occurred in this implementation.
Live Macadamia retesting and the remaining #7 acceptance checks are pending.

## Primary-source evidence and compatibility decision

- [Macadamia RequestPay.swift, lines 494–498](https://github.com/zeugmaster/macadamia/blob/47f4726a6197ef61fb7660b7469f7502d7c58951/macadamia/Wallet/RequestPay.swift#L494-L498)
  creates a POST URLRequest, assigns JSONEncoder output to httpBody, and submits
  with URLSession.shared. It does not explicitly set Content-Type.
- Its [dependency lock](https://github.com/zeugmaster/macadamia/blob/47f4726a6197ef61fb7660b7469f7502d7c58951/macadamia.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved)
  pins cashu-swift 0.4.5, revision `dd51e546cf1e593edb6a0c8ebbe022abac123fb9`.
  The [Codable payload](https://github.com/zeugmaster/cashu-swift/blob/dd51e546cf1e593edb6a0c8ebbe022abac123fb9/Sources/cashu-swift/Models/PaymentRequest.swift#L563-L578)
  has mint, unit, proofs and optional id/memo fields.
- [Swift Foundation HTTPURLProtocol](https://github.com/swiftlang/swift-corelibs-foundation/blob/883ec6b01e4bd18d8356cc3873acaf3c2feaa050/Sources/FoundationNetworking/URLSession/HTTP/HTTPURLProtocol.swift#L390-L403)
  adds `application/x-www-form-urlencoded` for a nonempty POST with no explicit
  Content-Type. Its [URLSession tests](https://github.com/swiftlang/swift-corelibs-foundation/blob/883ec6b01e4bd18d8356cc3873acaf3c2feaa050/Tests/Foundation/TestURLSession.swift#L1445-L1488)
  check the default header and unchanged body bytes. This is primary evidence for
  a native-client default, **not an on-device capture of the user's iOS build**.
- [NUT-18 HTTP transport and payload](https://github.com/cashubtc/nuts/blob/1363de413294e2ef3a57b16950f9506af38fffc2/18.md#L140-L165)
  specifies a JSON-serialized PaymentRequestPayload; this section does not
  require the Content-Type header.

The publisher accepts raw JSON with `application/json`, an absent header, or
`application/x-www-form-urlencoded`. Explicit media types are matched without
case and allow parameters. The form label is tolerated solely as a client default;
there is no URL/form decoding. Other types, including `text/plain`, remain 415:
this sender provided no evidence requiring a text/plain exception.

Invalid JSON/form bytes return 400 `Invalid payment JSON`; unsupported media types
return 415 `Unsupported payment Content-Type; send application/json`. Accepted
header variants share the same streamed 128 KiB cap, shape/proof/mint/unit/amount
validation, settlement, duplicate/concurrency handling and JSON/CORS responses.
Only finalized settlement grants access. No logging or CDK handling changed.

## Diagnosis and red → green

Seam: the already approved public HTTP publisher with temporary migrated SQLite,
valid synthetic proof shapes, and controlled external settlement. Uint8Array
bodies avoid fetch's automatic text/plain header. Identical payload bytes and
fresh publishers isolate the header difference. A separate ranked-hypothesis
phase was skipped because this exact reported transport difference is directly
reproducible; no production instrumentation was needed.

Command for both incremental cycles:

```sh
bun test apps/backend/src/purchase.test.ts -t 'JSON payment with Content-Type'
```

First red (before changing production code), exact relevant output:

```text
(pass) JSON payment with Content-Type application/json unlocks after settlement [42.19ms]
Expected: 200
Received: 415
(fail) JSON payment with Content-Type %s unlocks after settlement [14.25ms]
 1 pass
 9 filtered out
 1 fail
 8 expect() calls
Ran 2 tests across 1 file. [213.00ms]
```

The `%s` case is the absent header (Bun leaves the placeholder for undefined/null).
Allowing an absent header produced:

```text
 2 pass
 9 filtered out
 0 fail
 10 expect() calls
Ran 2 tests across 1 file. [273.00ms]
```

Adding the source-evidenced native default as the next test produced:

```text
Expected: 200
Received: 415
(fail) JSON payment with Content-Type application/x-www-form-urlencoded unlocks after settlement [40.40ms]
 2 pass
 9 filtered out
 1 fail
 13 expect() calls
Ran 3 tests across 1 file. [706.00ms]
```

Allowing that label while preserving JSON parsing produced:

```text
 3 pass
 9 filtered out
 0 fail
 15 expect() calls
Ran 3 tests across 1 file. [846.00ms]
```

Initial missing-workspace-dependency and sandbox listener failures were setup
failures, not red evidence. Frozen installation and approved local-listener runs
resolved them. Further checks extend all three accepted header variants through
invalid shapes/proofs/mint/unit/amounts, non-final settlement, malformed JSON and
actual form data, exact-size success, and streamed over-limit rejection. A first
full run exposed cancelled chunked-upload connection reuse (a subsequent read
received 400); the oversized-upload test now requests connection close explicitly.
Request construction was also corrected to satisfy the installed Bun/Node types.
Neither test-harness correction changes production behavior.

## Checks

- `bun install --frozen-lockfile`: passed, Bun 1.3.14.
- `bun test`: **48 passed, 0 failed**, 795 assertions; includes the real Coco
  adapter against valueless local mint fixtures, duplicates, concurrency,
  persistence, draining, and secret-free operator errors.
- `bun run typecheck`, `bun run build`, `bun run lint`: passed.
- `bun run test:browser:production`: **23 passed** (30.0s), including purchase,
  fresh-browser restore and secret handling against the local test fixture.
- `git diff --check`: passed; no debug instrumentation introduced.
- Integration remained at `371c69923e4af760f171a0793c0e8ffcc9ce0b94` during
  implementation; the final merge result and commit are in the #7 handoff.

The parent handles integration/redeployment with retained Fly state. This evidence
does not establish live wallet interoperability or satisfy #7's live acceptance.
