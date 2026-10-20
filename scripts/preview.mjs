// A dev-only static server for checking rendered pages by hand (not part of the CLI):
//   node scripts/preview.mjs [folder] [port]      (default: .tmp on port 4173)
// Serves that one folder on http://127.0.0.1 only, with caching off, and refuses any path outside it.
import { createServer } from "http"
import { readdirSync, readFileSync, statSync } from "fs"
import { extname, isAbsolute, relative, resolve } from "path"

const root = resolve(process.argv[2] ?? ".tmp")
const port = Number(process.argv[3] ?? 4173)
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" }

createServer((req, res) => {
  const send = (code, type, body) => {
    res.writeHead(code, { "content-type": type, "cache-control": "no-store" })
    res.end(body)
  }
  let path
  try {
    path = resolve(root, `.${decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname)}`)
  } catch {
    return send(400, "text/plain", "Bad request.")
  }
  const rel = relative(root, path)
  if (rel.split(/[\\/]/)[0] === ".." || isAbsolute(rel)) return send(403, "text/plain", "Outside the served folder.")
  try {
    if (statSync(path).isDirectory()) return send(200, "text/plain; charset=utf-8", readdirSync(path).join("\n"))
    send(200, TYPES[extname(path).toLowerCase()] ?? "application/octet-stream", readFileSync(path))
  } catch {
    send(404, "text/plain", "Not found.")
  }
}).listen(port, "127.0.0.1", () => console.log(`Serving ${root} on http://127.0.0.1:${port}/`))
