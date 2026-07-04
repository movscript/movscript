#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

const repoRoot = resolve(import.meta.dirname, '..')
const sourceDir = resolve(repoRoot, 'apps/plugin')
const distributionDir = resolve(repoRoot, 'plugins/movscript')
const rootPackage = readJSON(resolve(repoRoot, 'package.json'))
const pluginPackage = readJSON(resolve(sourceDir, 'package.json'))
const mirroredPaths = [
  '.codex-plugin',
  '.provider-plugin',
  '.mcp.json',
  'assets',
  'bin',
  'skills',
  'README.md',
]
const runtimeApiVersion = '1.0'
const args = new Set(process.argv.slice(2))
const write = args.has('--write')
const check = args.has('--check') || !write

if (args.has('--help')) {
  printUsage()
  process.exit(0)
}

if (!existsSync(sourceDir)) {
  console.error(`Plugin source directory is missing: ${sourceDir}`)
  process.exit(1)
}

if (write) {
  syncDistribution()
  console.log('Plugin distribution resources synced from apps/plugin.')
}

if (check) {
  const errors = distributionDifferences()
  if (errors.length > 0) {
    for (const error of errors) console.error(`plugin-distribution: ${error}`)
    process.exit(1)
  }
  console.log('Plugin distribution contract passed.')
}

function syncDistribution() {
  mkdirSync(distributionDir, { recursive: true })
  for (const relativePath of mirroredPaths) {
    const sourcePath = resolve(sourceDir, relativePath)
    const targetPath = resolve(distributionDir, relativePath)
    rmSync(targetPath, { recursive: true, force: true })
    mkdirSync(dirname(targetPath), { recursive: true })
    cpSync(sourcePath, targetPath, { recursive: true })
  }
  writeRuntimeManifest(distributionDir)
}

function distributionDifferences() {
  const errors = []
  for (const relativePath of mirroredPaths) {
    const sourcePath = resolve(sourceDir, relativePath)
    const targetPath = resolve(distributionDir, relativePath)
    if (!existsSync(targetPath)) {
      errors.push(`${relativePath} is missing from plugins/movscript`)
      continue
    }
    compareTrees(sourcePath, targetPath, relativePath, errors)
  }
  validateRuntimeManifest(distributionDir, errors)
  return errors
}

function expectedRuntimeManifest(pluginDir = distributionDir, generatedAt = new Date().toISOString()) {
  return {
    schema: 'movscript.runtime-bundle.v1',
    appId: 'plugin',
    applicationId: 'movscript.agent-plugin',
    artifact: 'movscript-agent-plugin',
    version: String(rootPackage.version || pluginPackage.version || '0.0.0'),
    packageName: pluginPackage.name,
    generatedAt,
    apiVersion: runtimeApiVersion,
    minDaemonApiVersion: runtimeApiVersion,
    bundleHash: pluginBundleHash(pluginDir),
    bundleHashAlgorithm: 'sha256',
    capabilities: {
      cli: true,
      mcp: true,
      daemon: true,
      project: true,
      timeline: true,
      canvas: true,
      resources: true,
      editing: true,
      media: true,
    },
    mcpServer: 'movscript',
    entrypoint: './bin/movscript',
    mcpArgs: ['mcp', 'stdio'],
    daemonArgs: ['daemon', 'run'],
    cliEntrypoint: './bin/movscript',
    legacyMcpEntrypoint: './bin/movscript-agent-mcp',
  }
}

function writeRuntimeManifest(pluginDir) {
  writeFileSync(resolve(pluginDir, 'manifest.runtime.json'), `${JSON.stringify(expectedRuntimeManifest(pluginDir), null, 2)}\n`, 'utf8')
}

function validateRuntimeManifest(pluginDir, errors) {
  const manifestPath = resolve(pluginDir, 'manifest.runtime.json')
  if (!existsSync(manifestPath)) {
    errors.push('manifest.runtime.json is missing from plugins/movscript')
    return
  }
  const actual = readJSON(manifestPath)
  const expected = expectedRuntimeManifest(pluginDir, actual.generatedAt)
  if (Object.hasOwn(actual, 'legacyCliEntrypoint')) {
    errors.push('manifest.runtime.json must not declare legacyCliEntrypoint')
  }
  const fields = [
    'schema',
    'appId',
    'applicationId',
    'artifact',
    'version',
    'packageName',
    'apiVersion',
    'minDaemonApiVersion',
    'bundleHash',
    'bundleHashAlgorithm',
    'mcpServer',
    'entrypoint',
    'cliEntrypoint',
    'legacyMcpEntrypoint',
  ]
  for (const field of fields) {
    if (actual[field] !== expected[field]) {
      errors.push(`manifest.runtime.json ${field} is ${JSON.stringify(actual[field])}, expected ${JSON.stringify(expected[field])}`)
    }
  }
  for (const field of ['mcpArgs', 'daemonArgs']) {
    if (JSON.stringify(actual[field]) !== JSON.stringify(expected[field])) {
      errors.push(`manifest.runtime.json ${field} is ${JSON.stringify(actual[field])}, expected ${JSON.stringify(expected[field])}`)
    }
  }
  if (JSON.stringify(actual.capabilities) !== JSON.stringify(expected.capabilities)) {
    errors.push(`manifest.runtime.json capabilities is ${JSON.stringify(actual.capabilities)}, expected ${JSON.stringify(expected.capabilities)}`)
  }
}

function compareTrees(sourcePath, targetPath, relativePath, errors) {
  const sourceStat = statSync(sourcePath)
  const targetStat = statSync(targetPath)
  if (sourceStat.isDirectory() !== targetStat.isDirectory()) {
    errors.push(`${relativePath} has different file type in plugins/movscript`)
    return
  }
  if (sourceStat.isDirectory()) {
    const sourceEntries = visibleEntries(sourcePath)
    const targetEntries = visibleEntries(targetPath)
    const names = new Set([...sourceEntries, ...targetEntries])
    for (const name of [...names].sort()) {
      if (!sourceEntries.includes(name)) {
        errors.push(`${relativePath}/${name} exists only in plugins/movscript`)
        continue
      }
      if (!targetEntries.includes(name)) {
        errors.push(`${relativePath}/${name} is missing from plugins/movscript`)
        continue
      }
      compareTrees(resolve(sourcePath, name), resolve(targetPath, name), `${relativePath}/${name}`, errors)
    }
    return
  }
  if (fileHash(sourcePath) !== fileHash(targetPath)) {
    errors.push(`${relativePath} differs between apps/plugin and plugins/movscript`)
  }
}

function visibleEntries(path) {
  return readdirSync(path).filter((name) => name !== '.DS_Store').sort()
}

function fileHash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function pluginBundleHash(pluginDir) {
  const hash = createHash('sha256')
  for (const file of pluginBundleFiles(pluginDir)) {
    hash.update(file)
    hash.update('\0')
    hash.update(readFileSync(resolve(pluginDir, file)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

function pluginBundleFiles(pluginDir) {
  const roots = [
    '.codex-plugin',
    '.provider-plugin',
    '.mcp.json',
    'assets',
    'bin',
    'skills',
    'README.md',
  ]
  const files = []
  for (const rootPath of roots) {
    const absolute = resolve(pluginDir, rootPath)
    if (!existsSync(absolute)) continue
    collectBundleFiles(pluginDir, rootPath, files)
  }
  return files.sort()
}

function collectBundleFiles(pluginDir, relativePath, files) {
  const absolute = resolve(pluginDir, relativePath)
  const stat = statSync(absolute)
  if (stat.isDirectory()) {
    for (const entry of visibleEntries(absolute)) {
      collectBundleFiles(pluginDir, `${relativePath}/${entry}`, files)
    }
    return
  }
  files.push(relativePath)
}

function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function printUsage() {
  console.error('Usage: node scripts/check-plugin-distribution.mjs [--check] [--write]')
}
