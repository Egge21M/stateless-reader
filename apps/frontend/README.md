# Stateless Reader frontend

The React/Vite frontend uses the project's Base UI shadcn components and neutral
light/dark theme. The catalogue is public: browsing and selecting an article need
no account or reader recovery phrase. Selection shows the public preview and a
locked-content notice; purchasing and signing belong to the following ticket.

## Run locally

From the repository root, install with `bun install`, then run the publisher and
frontend in separate terminals:

```sh
bun run dev:backend
bun run dev:frontend
```

Vite proxies `/articles` to `http://127.0.0.1:3000`. To use another publisher,
start the frontend with `PUBLISHER_ORIGIN=http://127.0.0.1:3001 bun run dev:frontend`.
The browser requests the same-origin `/articles` endpoint; a production host must
route that path to the publisher and serve the frontend's `dist` directory.
Never expose the backend source or backend bundle as static frontend assets.
The development server also restricts filesystem access to the frontend and its
dependencies and denies backend paths, including Vite `/@fs` and raw-source URLs.

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
catalogue and retries use the real publisher. No mint, funds, or wallet are needed.
Playwright traces for failures are saved in the ignored `test-results` directory.

## Components

Use installed components from `src/components/ui` before adding more. For example:

```tsx
import { Button } from "@/components/ui/button"
```

To add an official registry component from the repository root:

```sh
bunx --bun shadcn@latest add @shadcn/card -c apps/frontend
```
