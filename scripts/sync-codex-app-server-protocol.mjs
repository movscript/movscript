import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const defaultSource = resolve(repoRoot, '../codex/codex-rs/app-server-protocol/schema/typescript')
const defaultDestination = resolve(repoRoot, 'apps/frontend/src/shared/infrastructure/codex-app-server/app-server-protocol')

const source = resolve(process.argv[2] ?? defaultSource)
const destination = resolve(process.argv[3] ?? defaultDestination)

if (!existsSync(source)) {
  throw new Error(`Codex app-server protocol source does not exist: ${source}`)
}

if (!existsSync(resolve(source, 'ClientRequest.ts')) || !existsSync(resolve(source, 'ServerRequest.ts'))) {
  throw new Error(`Codex app-server protocol source is not a generated TypeScript schema directory: ${source}`)
}

mkdirSync(resolve(destination, '..'), { recursive: true })
rmSync(destination, { recursive: true, force: true })
cpSync(source, destination, { recursive: true })

const sourceFiles = listFiles(source)
const destinationFiles = listFiles(destination)
const missing = sourceFiles.filter((file) => !destinationFiles.includes(file))
const extra = destinationFiles.filter((file) => !sourceFiles.includes(file))

if (missing.length || extra.length) {
  throw new Error([
    'Codex app-server protocol sync failed.',
    missing.length ? `Missing files:\n${missing.join('\n')}` : '',
    extra.length ? `Extra files:\n${extra.join('\n')}` : '',
  ].filter(Boolean).join('\n\n'))
}

console.log(`Synced ${sourceFiles.length} Codex app-server protocol files`)
console.log(`source: ${relative(repoRoot, source)}`)
console.log(`target: ${relative(repoRoot, destination)}`)

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
