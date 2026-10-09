// Measures the initial JS (scripts index.html loads, plus their modulepreloads) after `vite build`.
// Spec 25.5: at most +60 kB gzip over the pre-5j baseline across 5j–5m; 5j holds 15 kB back.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const BASELINE_KB = 179.63
const PHASE_CEILING_KB = 224.63
const SPEC_CEILING_KB = BASELINE_KB + 60

const dist = join(import.meta.dirname, '..', 'dist')
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1] ?? '')
if (files.length === 0) {
  console.error('no initial JS found in index.html')
  process.exit(1)
}
const kb = files.reduce((sum, f) => sum + gzipSync(readFileSync(join(dist, f))).length / 1000, 0)

console.log(`initial JS ${kb.toFixed(2)} kB gzip (${files.join(', ')})`)
console.log(
  `baseline ${BASELINE_KB}, 5j ceiling ${PHASE_CEILING_KB}, spec ceiling ${SPEC_CEILING_KB}`,
)
if (kb > PHASE_CEILING_KB) {
  console.error('over budget')
  process.exit(1)
}
