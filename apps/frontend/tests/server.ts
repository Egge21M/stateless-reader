import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createServer } from "vite"
import { startPublisher } from "../../backend/src/app"

const directory = await mkdtemp(join(tmpdir(), "catalogue-browser-"))
const { startFakeMint } = await import('../../backend/tests/fake-mint')
const { openCocoSettlement } = await import('../../backend/src/coco')
const mint = startFakeMint()
const settlement = await openCocoSettlement({ databasePath: join(directory, 'coco.sqlite'), mint: mint.url, seed: new Uint8Array(64).fill(42) })
const publisher = startPublisher({
  mint: mint.url,
  settlement,
  publicOrigin: 'http://127.0.0.1:4173',
  port: 0,
  databasePath: join(directory, "application.sqlite"),
})
const frontend = await createServer({
  root: new URL("../", import.meta.url).pathname,
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    proxy: { "/article": publisher.url.origin, "/payment": publisher.url.origin },
  },
})
await frontend.listen()

let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await frontend.close()
  await publisher.stop()
  await mint.stop()
  await rm(directory, { recursive: true })
  process.exit(0)
}
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
