# Stateless Reader frontend

The React/Vite frontend uses the project's Base UI shadcn components and warm paper/ink
light/dark theme with serif editorial headlines. The catalogue is public: browsing and selecting an article need
no account or passkey. Selection shows a preview and entry to the accessible
Profile dialog. Login with passkey attempts discovery; failure offers explicit
creation. Reader seeds derive directly from WebAuthn PRF output with HKDF.
There are no phrase, import, export or backup controls. Only the same credential
and compatible provider/browser can recreate the reader.

Reader secrets stay in memory. Reload requires another passkey unlock; lock and
replacement clear the identity and payment view. Closing Profile cancels pending
unlock work. Stale results cannot restore an older reader. No seed/private key or
credential ID is persisted or transmitted by the app. The passkey provider stores
the credential. JavaScript cannot guarantee memory erasure. A valid unpaid request displays a NUT-18 QR and
copyable text with the fixed mint, unit and no-change/no-refund policy.
The payment request opens in a modal after unpaid access is confirmed. Profile
and payment dialogs never stack. While the payment dialog is open, fresh signed requests poll every 1.5 seconds
(after the previous read completes). A successful payment displays the full
article in the main reading area, closes the dialog, and stops polling. Escape,
outside click, the close controls, locking, or replacing the selection
aborts pending reads and prevents stale results from restoring an old view.
Closing does not cancel a wallet payment already sent. Reopen to check access with a fresh signed request. Both dialogs trap keyboard
focus and restore it on dismissal; successful payment focuses the reading heading.
See [passkey v2](../../docs/protocol/passkey-reader-v2.md) and [article/request v1](../../docs/protocol/reader-v1.md).

## Run locally

From the repository root, install with `bun install`, configure the publisher
seed and database paths as described in [the backend guide](../backend/README.md),
then explicitly migrate application state and run the publisher and
frontend in separate terminals:

```sh
bun run db:migrate
bun run dev:backend
bun run dev:frontend
```

Vite proxies `/articles`, `/article/*`, and `/payment/*` to `http://127.0.0.1:3000`. To use another publisher,
start the frontend with `PUBLISHER_ORIGIN=http://127.0.0.1:3001 bun run dev:frontend`.
The browser uses same-origin article endpoints; a production host must
route these paths to the publisher and serve the frontend's `dist` directory.
Never expose the backend source or backend bundle as static frontend assets.
The development server also restricts filesystem access to the frontend and its
dependencies plus shared core source, and denies backend paths, including Vite `/@fs` and raw-source URLs.

## Checks

```sh
bun run typecheck
bun run build
bun run lint
bun test
bunx playwright install chromium  # once, if not already installed
bun run test:browser
```

The browser suite explicitly migrates a temporary application SQLite database,
then launches the real publisher
and Vite on port 4173. Native WebAuthn tests use `localhost` as the RP hostname; numeric IP RP IDs are not supported. That port must be free. It verifies public metadata,
keyboard selection and focus, loading, empty, and error/retry behavior. A
regression check rejects backend fixture source requests. Only rare HTTP
outcomes are substituted at the browser network boundary; the normal
catalogue and retries use the real publisher. Purchase tests use real Coco and a local cryptographic mint with valueless test
proofs. No live mint, real funds, or external wallet are needed.
Reader browser checks also cover recovery in fresh contexts, memory-only state,
network disclosure, independent QR decoding, and stale async response/recovery
races. Purchase checks also cover two independent grants, fresh-browser paid
access, signed polling, cancellation and delayed paid responses. Reader and
purchase and dialog tests disable failure traces to avoid recording credential-bearing traces.
Other browser failure traces use the ignored `test-results` directory.

## Components

Use installed components from `src/components/ui` before adding more. For example:

```tsx
import { Button } from "@/components/ui/button"
```

To add an official registry component from the repository root:

```sh
bunx --bun shadcn@latest add @shadcn/card -c apps/frontend
```
