import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

const coreSharedEntrypoints = [
  'packages/core/src/index.ts',
  'packages/core/src/workspace/index.ts',
  'packages/core/src/mcp/index.ts',
  'packages/core/src/plugins/index.ts',
  'packages/core/src/backend/index.ts',
]

export function checkCoreSharedEntrypoints(repoRoot) {
  const failures = []
  const sourceRoot = resolve(repoRoot, 'packages/core/src')
  const seen = new Set()

  for (const entry of coreSharedEntrypoints) {
    walkCoreSharedFile(resolve(repoRoot, entry), sourceRoot, seen, failures)
  }

  return failures
}

function walkCoreSharedFile(file, sourceRoot, seen, failures) {
  if (seen.has(file) || !existsSync(file)) return
  seen.add(file)

  const source = readFileSync(file, 'utf8')
  const rel = toPosix(relative(resolve(sourceRoot, '../..'), file))
  const nodeImport = source.match(/(?:from|import)\s*['"](?:node:[^'"]+|fs|path|crypto|child_process|http|os)['"]|process\.|NodeJS\./)
  if (nodeImport) {
    failures.push(`shared @movscript/core entry reaches Node-only code: ${rel}`)
    return
  }

  if (toPosix(relative(sourceRoot, file)).split('/').includes('node')) {
    failures.push(`shared @movscript/core entry reaches /node adapter: ${rel}`)
    return
  }

  const importPattern = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g
  for (const match of source.matchAll(importPattern)) {
    const next = resolveRelativeSourceFile(file, match[1])
    if (next && next.startsWith(sourceRoot)) {
      walkCoreSharedFile(next, sourceRoot, seen, failures)
    }
  }
}

function resolveRelativeSourceFile(from, specifier) {
  if (!specifier.startsWith('.')) return null
  const base = resolve(dirname(from), specifier)
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    resolve(base, 'index.ts'),
  ]
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null
}

function toPosix(path) {
  return path.split('\\').join('/')
}
