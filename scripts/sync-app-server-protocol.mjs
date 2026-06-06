import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const defaultSource = defaultAppServerProtocolSource()
const defaultDestination = resolve(repoRoot, 'apps/frontend/src/shared/infrastructure/app-server/app-server-protocol')
const options = parseArgs(process.argv.slice(2))

const source = resolve(options.source ?? defaultSource)
const destination = resolve(options.destination ?? defaultDestination)

if (!existsSync(source)) {
  throw new Error(`app-server protocol source does not exist: ${source}`)
}

if (!existsSync(resolve(source, 'ClientRequest.ts')) || !existsSync(resolve(source, 'ServerRequest.ts'))) {
  throw new Error(`app-server protocol source is not a generated TypeScript schema directory: ${source}`)
}

if (!options.check) {
  mkdirSync(resolve(destination, '..'), { recursive: true })
  rmSync(destination, { recursive: true, force: true })
  cpSync(source, destination, { recursive: true })
} else if (!existsSync(destination)) {
  throw new Error(`app-server protocol destination does not exist: ${destination}`)
}

const sourceFiles = listFiles(source)
const destinationFiles = listFiles(destination)
const missing = sourceFiles.filter((file) => !destinationFiles.includes(file))
const extra = destinationFiles.filter((file) => !sourceFiles.includes(file))

if (missing.length || extra.length) {
  throw new Error([
    options.check ? 'app-server protocol check failed.' : 'app-server protocol sync failed.',
    missing.length ? `Missing files:\n${missing.join('\n')}` : '',
    extra.length ? `Extra files:\n${extra.join('\n')}` : '',
  ].filter(Boolean).join('\n\n'))
}

console.log(options.check
  ? `app-server protocol is in sync (${sourceFiles.length} files)`
  : `Synced ${sourceFiles.length} app-server protocol files`)
console.log(`source: ${relative(repoRoot, source)}`)
console.log(`target: ${relative(repoRoot, destination)}`)

function parseArgs(args) {
  const parsed = {
    check: false,
    source: undefined,
    destination: undefined,
  }
  const positionals = []
  for (const arg of args) {
    if (arg === '--check') {
      parsed.check = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
    if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`)
    positionals.push(arg)
  }
  if (positionals.length > 2) throw new Error('Usage: node scripts/sync-app-server-protocol.mjs [--check] [source] [destination]')
  parsed.source = positionals[0]
  parsed.destination = positionals[1]
  return parsed
}

function printHelp() {
  console.log(`Sync generated app-server protocol TypeScript files.

Usage:
  node scripts/sync-app-server-protocol.mjs [--check] [source] [destination]

Options:
  --check  Compare source and destination without writing files.
`)
}

function defaultAppServerProtocolSource() {
  return resolve(repoRoot, '../mova/codex-rs/app-server-protocol/schema/typescript')
}

function listFiles(root) {
  const files = []
  walk(root, '')
  return files.sort()

  function walk(current, prefix) {
    for (const entry of readdirSync(current).sort()) {
      const absolute = resolve(current, entry)
      const relativePath = prefix ? `${prefix}/${entry}` : entry
      if (statSync(absolute).isDirectory()) {
        walk(absolute, relativePath)
      } else {
        files.push(relativePath)
      }
    }
  }
}
