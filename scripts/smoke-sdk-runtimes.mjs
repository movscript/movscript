#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const args = process.argv.slice(2)
const options = parseArgs(args, process.env)
const runtimeRoot = options.runtimeDir ?? mkdtempSync(join(tmpdir(), 'movscript-sdk-runtime-smoke-'))
const cleanup = !options.keep && !options.runtimeDir

const packages = [
  {
    id: 'codex',
    packageName: options.codexPackage,
    packageVersion: options.codexVersion,
    requiredExports: ['Codex'],
    requiredTypePatterns: [
      'declare class Codex',
      'constructor(options?: CodexOptions)',
      'startThread(options?: ThreadOptions): Thread',
      'resumeThread(id: string, options?: ThreadOptions): Thread',
      'run(input: Input, turnOptions?: TurnOptions): Promise<Turn>',
    ],
  },
  {
    id: 'claude',
    packageName: options.claudePackage,
    packageVersion: options.claudeVersion,
    requiredExports: ['query'],
    requiredTypePatterns: [
      'export declare function query(_params:',
      'prompt: string | AsyncIterable<SDKUserMessage>',
      'options?: Options',
      '): Query',
    ],
  },
]

try {
  let failed = false
  for (const pkg of packages) {
    const result = await smokePackage(runtimeRoot, pkg)
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) failed = true
  }
  if (failed) process.exitCode = 1
} finally {
  if (cleanup) rmSync(runtimeRoot, { recursive: true, force: true })
}

function parseArgs(rawArgs, env) {
  const parsed = {
    codexPackage: env.MOVSCRIPT_CODEX_SDK_PACKAGE || '@openai/codex-sdk',
    codexVersion: env.MOVSCRIPT_CODEX_SDK_PACKAGE_VERSION || undefined,
    claudePackage: env.MOVSCRIPT_CLAUDE_SDK_PACKAGE || '@anthropic-ai/claude-agent-sdk',
    claudeVersion: env.MOVSCRIPT_CLAUDE_SDK_PACKAGE_VERSION || undefined,
    runtimeDir: env.MOVSCRIPT_SDK_RUNTIME_SMOKE_DIR || undefined,
    keep: env.MOVSCRIPT_SDK_RUNTIME_SMOKE_KEEP === '1',
  }
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index]
    const next = rawArgs[index + 1]
    if (arg === '--codex-package') {
      parsed.codexPackage = requiredValue(arg, next)
      index += 1
    } else if (arg === '--codex-version') {
      parsed.codexVersion = requiredValue(arg, next)
      index += 1
    } else if (arg === '--claude-package') {
      parsed.claudePackage = requiredValue(arg, next)
      index += 1
    } else if (arg === '--claude-version') {
      parsed.claudeVersion = requiredValue(arg, next)
      index += 1
    } else if (arg === '--runtime-dir') {
      parsed.runtimeDir = requiredValue(arg, next)
      index += 1
    } else if (arg === '--keep') {
      parsed.keep = true
    } else if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return parsed
}

async function smokePackage(runtimeRoot, pkg) {
  const packageSpec = pkg.packageVersion ? `${pkg.packageName}@${pkg.packageVersion}` : pkg.packageName
  const install = spawnSync('npm', ['install', '--prefix', runtimeRoot, '--save-exact', packageSpec], {
    cwd: runtimeRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (install.status !== 0 || install.error) {
    return {
      id: pkg.id,
      packageName: pkg.packageName,
      packageVersion: pkg.packageVersion,
      ok: false,
      phase: 'install',
      error: install.error?.message || install.stderr?.trim() || install.stdout?.trim() || `exit status ${install.status ?? 'unknown'}`,
    }
  }

  try {
    const entry = resolveInstalledPackageEntry(runtimeRoot, pkg.packageName)
    const module = await import(pathToFileURL(entry).href)
    const exports = Object.keys(module).sort()
    const missingExports = pkg.requiredExports.filter((name) => !(name in module))
    const typeProbe = probePackageTypes(runtimeRoot, pkg.packageName, pkg.requiredTypePatterns)
    return {
      id: pkg.id,
      packageName: pkg.packageName,
      packageVersion: installedPackageVersion(runtimeRoot, pkg.packageName) ?? pkg.packageVersion,
      ok: missingExports.length === 0 && typeProbe.ok,
      requiredExports: pkg.requiredExports,
      missingExports,
      requiredTypePatterns: pkg.requiredTypePatterns,
      missingTypePatterns: typeProbe.missing,
      typesPath: typeProbe.path,
      exports,
    }
  } catch (error) {
    return {
      id: pkg.id,
      packageName: pkg.packageName,
      packageVersion: pkg.packageVersion,
      ok: false,
      phase: 'import',
      error: error instanceof Error ? error.stack || error.message : String(error),
    }
  }
}

function resolveInstalledPackageEntry(runtimeRoot, packageName) {
  const runtimeRequire = createRequire(join(runtimeRoot, 'package.json'))
  try {
    return runtimeRequire.resolve(packageName)
  } catch (error) {
    if (!error || error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error
    return resolveImportOnlyPackageEntry(runtimeRoot, packageName)
  }
}

function resolveImportOnlyPackageEntry(runtimeRoot, packageName) {
  const packageDir = join(runtimeRoot, 'node_modules', packageName)
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
  const entry = packageManifestImportEntry(manifest)
  if (!entry) throw new Error(`SDK package ${packageName} does not expose an importable entrypoint.`)
  return join(packageDir, entry)
}

function packageManifestImportEntry(manifest) {
  const root = typeof manifest.exports === 'string'
    ? manifest.exports
    : manifest.exports && typeof manifest.exports === 'object'
      ? manifest.exports['.']
      : undefined
  return exportEntryPath(root) || manifest.module || manifest.main
}

function exportEntryPath(value) {
  if (typeof value === 'string' && value.trim()) return value
  if (!value || typeof value !== 'object') return undefined
  for (const key of ['import', 'default', 'module', 'node']) {
    const next = exportEntryPath(value[key])
    if (next) return next
  }
  return undefined
}

function installedPackageVersion(runtimeRoot, packageName) {
  try {
    const manifest = JSON.parse(readFileSync(join(runtimeRoot, 'node_modules', packageName, 'package.json'), 'utf8'))
    return typeof manifest.version === 'string' ? manifest.version : undefined
  } catch {
    return undefined
  }
}

function probePackageTypes(runtimeRoot, packageName, requiredPatterns) {
  const typesPath = resolveInstalledPackageTypes(runtimeRoot, packageName)
  if (!typesPath) return { ok: requiredPatterns.length === 0, path: undefined, missing: requiredPatterns }
  const source = readFileSync(typesPath, 'utf8')
  const normalizedSource = source.replace(/\s+/g, ' ')
  const missing = requiredPatterns.filter((pattern) => !normalizedSource.includes(pattern.replace(/\s+/g, ' ')))
  return { ok: missing.length === 0, path: typesPath, missing }
}

function resolveInstalledPackageTypes(runtimeRoot, packageName) {
  try {
    const packageDir = join(runtimeRoot, 'node_modules', packageName)
    const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
    const types = manifest.types || manifest.typings
    return typeof types === 'string' && types.trim() ? join(packageDir, types) : undefined
  } catch {
    return undefined
  }
}

function requiredValue(arg, value) {
  if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
  return value
}

function printUsage() {
  console.log(`Usage: node scripts/smoke-sdk-runtimes.mjs [options]

Options:
  --codex-package <name>    Codex SDK package. Defaults to MOVSCRIPT_CODEX_SDK_PACKAGE or @openai/codex-sdk.
  --codex-version <version> Codex SDK version. Defaults to MOVSCRIPT_CODEX_SDK_PACKAGE_VERSION or latest.
  --claude-package <name>   Claude SDK package. Defaults to MOVSCRIPT_CLAUDE_SDK_PACKAGE or @anthropic-ai/claude-agent-sdk.
  --claude-version <ver>    Claude SDK version. Defaults to MOVSCRIPT_CLAUDE_SDK_PACKAGE_VERSION or latest.
  --runtime-dir <path>      Install into this runtime directory instead of a temporary directory.
  --keep                    Keep the temporary runtime directory.
`)
}
