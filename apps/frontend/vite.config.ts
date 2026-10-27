import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    fs: {
      // The default workspace-wide allowlist would expose publisher fixtures.
      allow: [
        import.meta.dirname,
        resolve(import.meta.dirname, "../../node_modules"),
      ],
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem,key,p12,pfx,cer,der}",
        ".npmrc",
        ".yarnrc.yml",
        "**/.git/**",
        "**/apps/backend/**",
      ],
    },
    proxy: {
      "/articles": process.env.PUBLISHER_ORIGIN ?? "http://127.0.0.1:3000",
    },
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
})
