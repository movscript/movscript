import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const allowedTopLevelElectronTS = new Set([
  'appMenu.ts',
  'appWindow.ts',
  'main.ts',
  'managedServices.ts',
  'preload.ts',
])

const allowedRendererMCPPaths = new Set([
  'src/electron/ElectronMCPContextBridge.tsx',
  'src/features/agent/presentation/mcpStatus.test.ts',
  'src/features/agent/presentation/mcpStatus.ts',
  'src/features/agent/presentation/useAgentMCPReadiness.test.ts',
  'src/features/agent/presentation/useAgentMCPReadiness.ts',
  'src/features/plugins/infrastructure/mcpTools.ts',
  'src/shared/contracts/mcpContext.ts',
])

const ignoredRendererMCPPathPrefixes = [
  'src/shared/infrastructure/app-server/app-server-protocol/',
]

const removedRendererMCPPaths = [
  'src/mcp',
  'src/shared/infrastructure/mcpStatus.test.ts',
  'src/shared/infrastructure/mcpStatus.ts',
  'src/shared/infrastructure/mcpTools.ts',
]

const removedElectronMCPPaths = [
  'electron/mcp',
]

const staleImportPatterns = [
  {
    label: 'renderer importing deprecated broad @movscript/core root',
    pattern: /(?:from|import)\s*['"]@movscript\/core['"]/,
    roots: ['src'],
  },
  {
    label: 'renderer importing removed MovScript workspace contracts entry',
    pattern: /(?:from|import)\s*['"]@movscript\/core\/workspace-contracts['"]/,
    roots: ['src'],
  },
  {
    label: 'renderer importing Node-only MovScript core entry',
    pattern: /(?:from|import)\s*['"]@movscript\/core\/(?:node|[^'"]+\/node)['"]/,
    roots: ['src'],
  },
  {
    label: 'renderer importing Node built-in module',
    pattern: /(?:from|import)\s*['"](?:node:[^'"]+|fs|path|crypto|child_process|http|os)['"]/,
    roots: ['src'],
  },
  {
    label: 'renderer shared MCP helper import',
    pattern: /@\/shared\/infrastructure\/(?:mcpTools|mcpStatus)|shared\/infrastructure\/(?:mcpTools|mcpStatus)/,
    roots: ['src'],
  },
  {
    label: 'Electron importing renderer feature or shared infrastructure internals',
    pattern: /(?:from|import)\s*['"](?:\.\.\/\.\.\/src\/(?:features|shared\/infrastructure)|@\/features|@\/shared\/infrastructure)/,
    roots: ['electron'],
  },
  {
    label: 'Electron deep import across MCP implementation directories',
    pattern: /(?:from|import)\s*['"](?:\.\.\/mcp\/[^'"]+\/|\.\/mcp\/[^'"]+\/)/,
    roots: ['electron'],
  },
  {
    label: 'Electron deep import across service implementation directories',
    pattern: /(?:from|import)\s*['"](?:\.\.\/services\/[^'"]+\/|\.\/services\/[^'"]+\/)/,
    roots: ['electron'],
  },
]

const coreSharedEntrypoints = [
  'packages/core/src/index.ts',
  'packages/core/src/workspace/index.ts',
  'packages/core/src/mcp/index.ts',
  'packages/core/src/plugins/index.ts',
  'packages/core/src/backend/index.ts',
]

export function checkElectronBoundaries(frontendRoot) {
  const failures = []

  for (const entry of listFiles(resolve(frontendRoot, 'electron'), (file) => file.endsWith('.ts'))) {
    const name = relative(resolve(frontendRoot, 'electron'), entry)
    if (!name.includes('/') && !allowedTopLevelElectronTS.has(name)) {
      failures.push(`Unexpected top-level electron TypeScript file: electron/${name}`)
    }
  }

  for (const removedPath of removedRendererMCPPaths) {
    if (existsSync(resolve(frontendRoot, removedPath))) {
      failures.push(`Removed renderer MCP path still exists: ${removedPath}`)
    }
  }

  for (const removedPath of removedElectronMCPPaths) {
    if (existsSync(resolve(frontendRoot, removedPath))) {
      failures.push(`Removed Electron MCP implementation path still exists: ${removedPath}`)
    }
  }

  for (const entry of listFiles(resolve(frontendRoot, 'src'), (file) => /mcp/i.test(file))) {
    const rel = toPosix(relative(frontendRoot, entry))
    if (ignoredRendererMCPPathPrefixes.some((prefix) => rel.startsWith(prefix))) continue
    if (!allowedRendererMCPPaths.has(rel)) {
      failures.push(`Unexpected renderer MCP-named file: ${rel}`)
    }
  }

  for (const { label, pattern, roots } of staleImportPatterns) {
    for (const root of roots) {
      for (const entry of listFiles(resolve(frontendRoot, root), isSourceFile)) {
        const rel = toPosix(relative(frontendRoot, entry))
        if (label === 'renderer importing Node built-in module' && isRendererTestOrE2EPath(rel)) continue
        const source = readFileSync(entry, 'utf8')
        if (pattern.test(source)) {
          failures.push(`${label}: ${rel}`)
        }
      }
    }
  }

  for (const failure of checkCoreSharedEntrypoints(resolve(frontendRoot, '../..'))) {
    failures.push(failure)
  }

  return failures
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const failures = checkElectronBoundaries(frontendRoot)
  if (failures.length > 0) {
    console.error('Electron boundary check failed:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log('Electron boundary check passed.')
}

function listFiles(root, predicate) {
  if (!existsSync(root)) return []
  const files = []
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()
    const stat = statSync(current)
    if (stat.isDirectory()) {
      for (const child of readdirSync(current)) {
        if (child === 'node_modules' || child === 'dist' || child === 'out') continue
        stack.push(resolve(current, child))
      }
      continue
    }
    if (stat.isFile() && predicate(current)) files.push(current)
  }
  return files
}

function isSourceFile(file) {
  return /\.(ts|tsx|mts|cts)$/.test(file)
}

function toPosix(path) {
  return path.split('\\').join('/')
}

function isRendererTestOrE2EPath(path) {
  return path.startsWith('src/e2e/')
    || /\.(test|spec)\.(ts|tsx|mts|cts)$/.test(path)
}

function checkCoreSharedEntrypoints(repoRoot) {
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
