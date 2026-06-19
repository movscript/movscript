import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkCoreSharedEntrypoints } from '../../../scripts/core-runtime-boundary-utils.mjs'

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

const ignoredRendererMCPPathPrefixes = []

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

  for (const failure of checkFrontendCoreAliasConfig(frontendRoot)) {
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

function checkFrontendCoreAliasConfig(frontendRoot) {
  const failures = []

  const tsconfigPath = resolve(frontendRoot, 'tsconfig.json')
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'))
  if (tsconfig.compilerOptions?.paths?.['@movscript/core']) {
    failures.push('frontend renderer tsconfig exposes deprecated broad @movscript/core root alias')
  }
  if (hasCoreNodePathAlias(tsconfig)) {
    failures.push('frontend renderer tsconfig exposes Node-only @movscript/core/*/node path alias')
  }
  if (hasIncludeEntry(tsconfig, 'electron')) {
    failures.push('frontend renderer tsconfig includes Electron source')
  }

  const electronTsconfigPath = resolve(frontendRoot, 'tsconfig.electron.json')
  if (!existsSync(electronTsconfigPath)) {
    failures.push('frontend must define tsconfig.electron.json for Electron source')
  } else {
    const electronTsconfig = JSON.parse(readFileSync(electronTsconfigPath, 'utf8'))
    if (electronTsconfig.compilerOptions?.paths?.['@movscript/core']) {
      failures.push('frontend Electron tsconfig exposes deprecated broad @movscript/core root alias')
    }
    if (!hasCoreNodePathAlias(electronTsconfig)) {
      failures.push('frontend Electron tsconfig must own Node-only @movscript/core/*/node path aliases')
    }
    if (!hasIncludeEntry(electronTsconfig, 'electron')) {
      failures.push('frontend Electron tsconfig must include Electron source')
    }
  }

  const e2eConfigPath = resolve(frontendRoot, 'vite.e2e.config.ts')
  const e2eConfig = readFileSync(e2eConfigPath, 'utf8')
  if (hasCoreRootAlias(e2eConfig)) {
    failures.push('frontend e2e renderer Vite config exposes deprecated broad @movscript/core root alias')
  }
  if (hasCoreNodeAlias(e2eConfig)) {
    failures.push('frontend e2e renderer Vite config exposes Node-only @movscript/core/*/node alias')
  }

  const electronViteConfigPath = resolve(frontendRoot, 'electron.vite.config.ts')
  const electronViteConfig = readFileSync(electronViteConfigPath, 'utf8')
  if (hasCoreRootAlias(electronViteConfig)) {
    failures.push('Electron Vite config exposes deprecated broad @movscript/core root alias')
  }
  const rendererAliasBlock = electronViteConfig.match(/const\s+rendererAlias\s*=\s*\{([\s\S]*?)\n\}/)?.[1]
  if (!rendererAliasBlock) {
    failures.push('Electron Vite config must define a rendererAlias block')
  } else if (rendererAliasBlock.includes('coreNodeAlias') || hasCoreNodeAlias(rendererAliasBlock)) {
    failures.push('Electron renderer Vite config exposes Node-only @movscript/core/*/node alias')
  }

  return failures
}

function hasCoreRootAlias(source) {
  return /['"]@movscript\/core['"]\s*:/.test(source)
}

function hasCoreNodeAlias(source) {
  return /['"]@movscript\/core\/(?:workspace|mcp|backend|plugins)\/node['"]\s*:/.test(source)
}

function hasCoreNodePathAlias(tsconfig) {
  const paths = tsconfig.compilerOptions?.paths ?? {}
  return Object.keys(paths).some((key) => /^@movscript\/core\/(?:workspace|mcp|backend|plugins)\/node$/.test(key))
}

function hasIncludeEntry(tsconfig, entry) {
  return Array.isArray(tsconfig.include) && tsconfig.include.includes(entry)
}
