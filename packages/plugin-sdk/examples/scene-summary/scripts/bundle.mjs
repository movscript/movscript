/**
 * Bundle script: reads src/index.ts, extracts the `run` function and `manifest`,
 * and writes a self-contained plugin JSON to dist/plugin.json.
 *
 * Usage: node scripts/bundle.mjs
 *
 * The output JSON can be hosted anywhere and installed via the Movscript
 * "Install from URL" feature.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// Read the TypeScript source and strip type annotations for the script field.
// For a real project, use tsup/esbuild to compile first, then read dist output.
const src = readFileSync(resolve(root, 'src/index.ts'), 'utf8')

// Extract the run function body (everything between the first `{` and last `}`)
const runMatch = src.match(/export async function run[\s\S]*?^}/m)
if (!runMatch) throw new Error('Could not find run() function in src/index.ts')

// Strip TypeScript type annotations from the function signature
const runFn = runMatch[0]
  .replace(/export async function run\(mov: MovRuntime, args: Args\)/, 'async function run(mov, args)')
  .replace(/: Promise<ToolResult>/, '')
  .replace(/: Array<\{[\s\S]*?\}>/, '')
  .replace(/as Array<[\s\S]*?>/g, '')
  .replace(/: string/g, '')
  .replace(/: number/g, '')
  .replace(/\?\s*:/g, ':')
  .replace(/interface Args \{[\s\S]*?\}\n\n/, '')

// Extract manifest (static object literal)
const manifestMatch = src.match(/export const manifest = (\{[\s\S]*?\})\n/)
if (!manifestMatch) throw new Error('Could not find manifest export in src/index.ts')

let manifest
try {
  // Use eval to parse the object literal (safe here since it's our own source)
  manifest = eval(`(${manifestMatch[1]})`)
} catch {
  throw new Error('Could not parse manifest object')
}

const plugin = {
  ...manifest,
  script: runFn,
}

mkdirSync(resolve(root, 'dist'), { recursive: true })
writeFileSync(resolve(root, 'dist/plugin.json'), JSON.stringify(plugin, null, 2))
console.log(`✓ Bundled plugin to dist/plugin.json (id: ${manifest.id})`)
