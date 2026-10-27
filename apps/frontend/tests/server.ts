import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createServer } from "vite"
import { startPublisher } from "../../backend/src/app"

const directory = await mkdtemp(join(tmpdir(), "catalogue-browser-"))
const publisher = startPublisher({
  port: 0,
  databasePath: join(directory, "application.sqlite"),
})
const frontend = await createServer({
  root: new URL("../", import.meta.url).pathname,
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    proxy: { "/article": publisher.url.origin },
  },
})
await frontend.listen()

let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await frontend.close()
  await publisher.stop()
  await rm(directory, { recursive: true })
  process.exit(0)
}
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
