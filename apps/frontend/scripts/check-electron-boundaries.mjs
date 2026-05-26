import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const allowedTopLevelElectronTS = new Set([
  'appWindow.ts',
  'main.ts',
  'managedServices.ts',
  'preload.ts',
])

const allowedRendererMCPPaths = new Set([
  'src/electron/ElectronMCPContextBridge.tsx',
  'src/features/agent/presentation/mcpStatus.test.ts',
  'src/features/agent/presentation/mcpStatus.ts',
  'src/features/agent/presentation/useAgentMCPReadiness.ts',
  'src/features/plugins/infrastructure/mcpTools.ts',
  'src/shared/contracts/mcpContext.ts',
])

const removedRendererMCPPaths = [
  'src/mcp',
  'src/shared/infrastructure/mcpStatus.test.ts',
  'src/shared/infrastructure/mcpStatus.ts',
  'src/shared/infrastructure/mcpTools.ts',
]

const staleImportPatterns = [
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

  for (const entry of listFiles(resolve(frontendRoot, 'src'), (file) => /mcp/i.test(file))) {
    const rel = toPosix(relative(frontendRoot, entry))
    if (!allowedRendererMCPPaths.has(rel)) {
      failures.push(`Unexpected renderer MCP-named file: ${rel}`)
    }
  }

  for (const { label, pattern, roots } of staleImportPatterns) {
    for (const root of roots) {
      for (const entry of listFiles(resolve(frontendRoot, root), isSourceFile)) {
        const source = readFileSync(entry, 'utf8')
        if (pattern.test(source)) {
          failures.push(`${label}: ${toPosix(relative(frontendRoot, entry))}`)
        }
      }
    }
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
