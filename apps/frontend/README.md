# React + TypeScript + Vite + shadcn/ui

The frontend workspace for Stateless Reader, generated with the official
[shadcn Vite starter](https://ui.shadcn.com/docs/installation/vite).

From the repository root, run `bun install` followed by `bun run dev:frontend`.
Run `bun run build`, `bun run typecheck`, and `bun run lint` to check the workspaces.

## Adding components

To add components to your app, run the following command:

```bash
bunx --bun shadcn@latest add card -c apps/frontend
```

Run this from the repository root. Components are added to this workspace's
`src/components/ui` directory. The starter already includes `Button`.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button"
```
