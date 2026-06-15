#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const schema = 'movscript.package-resources.v1'
const allowedEditions = new Set(['community', 'enterprise'])
const allowedCategories = new Set([
  'managed-agent',
  'managed-binary',
  'plugin-bundle',
  'runtime-tool',
  'static-asset',
  'static-runtime',
  'third-party-binary',
])
const allowedSources = new Set([
  'build-artifact',
  'downloaded-release-artifact',
  'enterprise-build-artifact',
  'enterprise-overlay',
  'repository',
  'staged-build-artifact',
])
const allowedUpdatePolicies = new Set(['bundled-with-app', 'external-updater', 'user-data'])
const allowedPlatforms = new Set(['darwin', 'linux', 'win32'])
const allowedArchs = new Set(['x64', 'arm64'])

if (isDirectRun(import.meta.url, process.argv)) {
  runVerifyPackageResourcesCli(process.argv.slice(2))
}

export function runVerifyPackageResourcesCli(args = [], options = {}) {
  const {
    exit = process.exit,
    log = console.log,
    logError = console.error,
  } = options
  const parsed = parseArgs(args)
  if (parsed.help) {
    log(helpText())
    return
  }
  try {
    const result = verifyPackageResources(parsed.root, parsed.manifest)
    log(`Package resource contract verification passed (${result.resources.length} resources).`)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
  }
}

export function verifyPackageResources(root = repoRoot, manifestPath = 'package-resources.manifest.json') {
  const absoluteManifestPath = resolve(root, manifestPath)
  const manifest = readJSON(absoluteManifestPath, manifestPath)
  const errors = validateManifest(root, manifest)
  if (errors.length > 0) {
    throw new Error(['Package resource contract verification failed:', ...errors.map((error) => `- ${error}`)].join('\n'))
  }
  return manifest
}

export function validateManifest(root, manifest) {
  const errors = []
  if (manifest?.schema !== schema) errors.push(`schema must be ${schema}`)
  if (!nonEmptyString(manifest.product)) errors.push('product must be set')
  if (!allowedEditions.has(manifest.edition)) errors.push(`edition must be one of ${[...allowedEditions].join(', ')}`)
  if (!nonEmptyString(manifest.owner)) errors.push('owner must be set')
  if (!nonEmptyString(manifest.builderConfig)) errors.push('builderConfig must be set')
  if (!stringArray(manifest.packageFiles) || manifest.packageFiles.length === 0) errors.push('packageFiles must list packaged app files')
  if (!Array.isArray(manifest.resources) || manifest.resources.length === 0) errors.push('resources must list packaged extra resources')
  if (!stringArray(manifest.forbiddenPackagePaths) || manifest.forbiddenPackagePaths.length === 0) {
    errors.push('forbiddenPackagePaths must list paths that must never be packaged')
  }

  if (!nonEmptyString(manifest.builderConfig)) return errors
  const builderConfigPath = resolve(root, manifest.builderConfig)
  if (!existsSync(builderConfigPath)) {
    errors.push(`builderConfig does not exist: ${manifest.builderConfig}`)
    return errors
  }

  const builderConfig = readFileSync(builderConfigPath, 'utf8')
  const builderPackageFiles = parseTopLevelStringList(builderConfig, 'files')
  const builderExtraResources = parseExtraResources(builderConfig)
  compareStringList('packageFiles', manifest.packageFiles ?? [], builderPackageFiles, errors)

  const resourceIds = []
  const manifestResources = Array.isArray(manifest.resources) ? manifest.resources : []
  for (const resource of manifestResources) {
    validateResource(resource, resourceIds, errors)
  }
  assertSortedUnique(resourceIds, 'resource ids', errors)
  compareResources(manifestResources, builderExtraResources, errors)
  validateForbiddenPaths(manifest, errors)
  return errors
}

export function parseExtraResources(source) {
  const lines = source.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === 'extraResources:')
  if (start === -1) return []
  const resources = []
  let current = null
  let inFilter = false
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^\S/.test(line) && line.trim()) break
    const fromMatch = line.match(/^  - from:\s*(.+?)\s*$/)
    if (fromMatch) {
      current = { from: unquote(fromMatch[1]), to: '', filter: [] }
      resources.push(current)
      inFilter = false
      continue
    }
    if (!current) continue
    const toMatch = line.match(/^    to:\s*(.+?)\s*$/)
    if (toMatch) {
      current.to = unquote(toMatch[1])
      inFilter = false
      continue
    }
    if (/^    filter:\s*$/.test(line)) {
      inFilter = true
      continue
    }
    const filterMatch = line.match(/^      -\s*(.+?)\s*$/)
    if (inFilter && filterMatch) current.filter.push(unquote(filterMatch[1]))
  }
  return resources
}

export function parseTopLevelStringList(source, key) {
  const lines = source.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === `${key}:`)
  if (start === -1) return []
  const values = []
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^\S/.test(line) && line.trim()) break
    const match = line.match(/^  -\s*(.+?)\s*$/)
    if (match) values.push(unquote(match[1]))
  }
  return values
}

function compareResources(manifestResources, builderResources, errors) {
  const expectedByTarget = new Map()
  for (const resource of manifestResources) {
    const key = resourceKey(resource)
    if (expectedByTarget.has(key)) errors.push(`${resource.id}: duplicate manifest resource target ${key}`)
    expectedByTarget.set(key, resource)
  }
  const actualByTarget = new Map()
  for (const resource of builderResources) {
    const key = resourceKey(resource)
    if (actualByTarget.has(key)) errors.push(`electron-builder duplicate extraResources target ${key}`)
    actualByTarget.set(key, resource)
  }
  for (const [key, expected] of expectedByTarget) {
    const actual = actualByTarget.get(key)
    if (!actual) {
      errors.push(`${expected.id}: missing electron-builder extraResources entry ${key}`)
      continue
    }
    compareStringList(`${expected.id}.filter`, expected.filter ?? [], actual.filter ?? [], errors)
  }
  for (const [key] of actualByTarget) {
    if (!expectedByTarget.has(key)) errors.push(`electron-builder extraResources entry is not declared in manifest: ${key}`)
  }
}

function validateResource(resource, resourceIds, errors) {
  if (!resource || typeof resource !== 'object' || Array.isArray(resource)) {
    errors.push('resource entries must be objects')
    return
  }
  const label = nonEmptyString(resource.id) ? resource.id : '<missing id>'
  const allowedKeys = [
    'arches',
    'category',
    'filter',
    'from',
    'id',
    'license',
    'owner',
    'platforms',
    'required',
    'source',
    'to',
    'updatePolicy',
    'verification',
  ]
  for (const key of Object.keys(resource)) {
    if (!allowedKeys.includes(key)) errors.push(`${label}: unknown field ${key}`)
  }
  if (!nonEmptyString(resource.id)) errors.push(`${label}: id must be set`)
  else resourceIds.push(resource.id)
  if (!allowedCategories.has(resource.category)) errors.push(`${label}: category must be one of ${[...allowedCategories].join(', ')}`)
  if (!safeBuilderRelativePath(resource.from)) errors.push(`${label}: from must be relative to the Electron Builder config`)
  if (!safePackagePath(resource.to)) errors.push(`${label}: to must be a package-relative path`)
  if (!allowedSources.has(resource.source)) errors.push(`${label}: source must be one of ${[...allowedSources].join(', ')}`)
  if (typeof resource.required !== 'boolean') errors.push(`${label}: required must be boolean`)
  if (!nonEmptyString(resource.owner)) errors.push(`${label}: owner must be set`)
  if (!isSPDXLike(resource.license)) errors.push(`${label}: license must be an SPDX-style expression or LicenseRef-*`)
  if (!allowedUpdatePolicies.has(resource.updatePolicy)) errors.push(`${label}: updatePolicy must be one of ${[...allowedUpdatePolicies].join(', ')}`)
  if (resource.filter !== undefined && (!stringArray(resource.filter) || resource.filter.length === 0)) errors.push(`${label}: filter must be a non-empty array of strings`)
  if (!stringArray(resource.verification) || resource.verification.length === 0) errors.push(`${label}: verification must list at least one gate`)
  if (resource.platforms !== undefined && (!stringArray(resource.platforms) || resource.platforms.some((item) => !allowedPlatforms.has(item)))) {
    errors.push(`${label}: platforms may only include ${[...allowedPlatforms].join(', ')}`)
  }
  if (resource.arches !== undefined && (!stringArray(resource.arches) || resource.arches.some((item) => !allowedArchs.has(item)))) {
    errors.push(`${label}: arches may only include ${[...allowedArchs].join(', ')}`)
  }
}

function validateForbiddenPaths(manifest, errors) {
  for (const forbiddenPath of manifest.forbiddenPackagePaths ?? []) {
    if (!safePackagePath(forbiddenPath.replace(/\*\*?\/?$/g, 'placeholder'))) {
      errors.push(`forbiddenPackagePaths contains unsafe path: ${forbiddenPath}`)
    }
  }
  const forbidden = new Set(manifest.forbiddenPackagePaths ?? [])
  for (const packageFile of manifest.packageFiles ?? []) {
    if (forbidden.has(packageFile)) errors.push(`packageFiles includes forbidden path: ${packageFile}`)
  }
  for (const resource of manifest.resources ?? []) {
    if (forbidden.has(resource.to)) errors.push(`${resource.id}: to path is forbidden: ${resource.to}`)
  }
}

function compareStringList(label, expected, actual, errors) {
  const expectedList = expected ?? []
  const actualList = actual ?? []
  if (expectedList.length !== actualList.length || expectedList.some((item, index) => item !== actualList[index])) {
    errors.push(`${label} mismatch: expected [${expectedList.join(', ')}], got [${actualList.join(', ')}]`)
  }
}

function assertSortedUnique(values, label, errors) {
  const seen = new Set()
  let previous = ''
  for (const value of values) {
    if (seen.has(value)) errors.push(`${label}: duplicate ${value}`)
    seen.add(value)
    if (previous && previous.localeCompare(value) > 0) errors.push(`${label}: values must be sorted lexicographically`)
    previous = value
  }
}

function resourceKey(resource) {
  return `${resource.from} -> ${resource.to}`
}

function readJSON(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`Unable to read ${label}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function safeBuilderRelativePath(value) {
  if (!nonEmptyString(value)) return false
  if (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) return false
  const parts = value.split(/[\\/]+/)
  return parts.length > 0 && !parts.includes('')
}

function safePackagePath(value) {
  if (!nonEmptyString(value)) return false
  if (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) return false
  const parts = value.split(/[\\/]+/)
  return parts.length > 0 && !parts.includes('') && !parts.includes('.') && !parts.includes('..')
}

function isSPDXLike(value) {
  if (!nonEmptyString(value)) return false
  if (value.startsWith('LicenseRef-')) return true
  return /^[A-Za-z0-9.+-]+(?:\s+(?:AND|OR|WITH)\s+[A-Za-z0-9.+-]+)*$/.test(value) && (/-\d/.test(value) || value === 'Apache-2.0')
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function stringArray(value) {
  return Array.isArray(value) && value.every(nonEmptyString)
}

function unquote(value) {
  const trimmed = String(value).trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseArgs(args) {
  const parsed = {
    help: false,
    manifest: 'package-resources.manifest.json',
    root: repoRoot,
  }
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') parsed.help = true
    else if (arg.startsWith('--manifest=')) parsed.manifest = arg.slice('--manifest='.length)
    else if (arg.startsWith('--root=')) parsed.root = resolve(arg.slice('--root='.length))
    else throw new Error(`Unexpected argument: ${arg}`)
  }
  return parsed
}

function helpText() {
  return `
Usage: node scripts/release/verify-package-resources.mjs [--root=<dir>] [--manifest=<path>]

Verifies package-resources.manifest.json against the Electron Builder files and extraResources contract.
`.trim()
}

function isDirectRun(moduleUrl, argv = process.argv) {
  return argv[1] && fileURLToPath(moduleUrl) === resolve(argv[1])
}
