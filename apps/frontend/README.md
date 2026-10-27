# Stateless Reader frontend

The React/Vite frontend uses the project's Base UI shadcn components and neutral
light/dark theme. The catalogue is public: browsing and selecting an article need
no account or reader recovery phrase. Selection shows the public preview and a
locked-content notice. Create a random twelve-word reader phrase or restore a
validated English BIP39 phrase to request article access. The empty BIP39
passphrase is fixed; the reader phrase is separate from the external wallet seed.
Back up the phrase privately. Losing it loses access; sharing it shares access.

Reader secrets stay in memory. Reload requires restoration; lock and replacement
clear the active identity, draft and payment view, including pending async work.
This does not guarantee erasure from JavaScript memory. No phrase/seed/private
key is persisted or transmitted. A valid unpaid request displays a NUT-18 QR and
copyable text with the fixed mint, unit and no-change/no-refund policy.
While the payment panel is open, fresh signed requests poll every 1.5 seconds
(after the previous read completes). A successful payment displays the full
article and stops polling. Closing the panel, locking, or replacing the selection
aborts pending reads and prevents stale results from restoring an old view.
Closing does not cancel a wallet payment already sent. Reopen to check access.
See the frozen [v1 compatibility contract](../../docs/protocol/reader-v1.md).

## Run locally

From the repository root, install with `bun install`, configure the publisher
seed and database paths as described in [the backend guide](../backend/README.md),
then run the publisher and
frontend in separate terminals:

```sh
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

The browser suite launches the real publisher with a temporary SQLite database
and Vite on `127.0.0.1:4173`. That port must be free. It verifies public metadata,
keyboard selection and focus, loading, empty, and error/retry behavior. A
regression check rejects backend fixture source requests. Only rare HTTP
outcomes are substituted at the browser network boundary; the normal
catalogue and retries use the real publisher. Purchase tests use real Coco and a local cryptographic mint with valueless test
proofs. No live mint, real funds, or external wallet are needed.
Reader browser checks also cover recovery in fresh contexts, memory-only state,
network disclosure, independent QR decoding, and stale async response/recovery
races. Purchase checks also cover two independent grants, fresh-browser paid
access, signed polling, cancellation and delayed paid responses. Reader and
purchase tests disable failure traces to avoid recording phrase-bearing DOM.
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
