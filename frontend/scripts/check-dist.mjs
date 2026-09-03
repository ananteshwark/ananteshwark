// Build guard: nothing in dist may rely on a file extension the deploy target
// might not have a MIME type for.
//
// The pdf.js worker once shipped as the build's only `.mjs` file. nginx's stock
// mime.types has no entry for that extension, so it went out as
// application/octet-stream, and with X-Content-Type-Options: nosniff the
// browser refused to execute it — the "Original file" view showed an error and
// no document. Nothing in the build or the test suite noticed; only production
// did. This runs after every build so a dependency reintroducing one fails here
// instead of on the server.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const BLOCKED = ['.mjs', '.cjs']
const DIST = new URL('../dist', import.meta.url).pathname

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else out.push(path)
  }
  return out
}

const offenders = walk(DIST).filter((p) => BLOCKED.some((ext) => p.endsWith(ext)))
if (offenders.length) {
  console.error(
    `\nBuild guard: ${offenders.length} file(s) use an extension many static servers\n`
    + 'have no MIME type for, which browsers then refuse to execute:\n'
    + offenders.map((p) => `  ${p.replace(DIST, 'dist')}`).join('\n')
    + '\n\nImport it in a form that emits .js — for a worker, use `?worker`\n'
    + 'rather than `?url`. See src/components/PdfRiskOverlay.jsx.\n',
  )
  process.exit(1)
}
console.log(`dist check: no risky extensions (${BLOCKED.join(', ')})`)
