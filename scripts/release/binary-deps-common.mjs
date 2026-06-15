import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

export const binaryDepsSchema = 'movscript.binary-deps.v1'

export function readBinaryDepsManifest(root = process.cwd(), manifestPath = 'binary-deps.manifest.json') {
  const absolutePath = resolve(root, manifestPath)
  let manifest
  try {
    manifest = JSON.parse(readFileSync(absolutePath, 'utf8'))
  } catch (error) {
    throw new Error(`Unable to read binary dependency manifest ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`)
  }
  validateBinaryDepsManifest(manifest, manifestPath)
  return manifest
}

export function validateBinaryDepsManifest(manifest, manifestPath = 'binary-deps.manifest.json') {
  const errors = []
  if (manifest?.schema !== binaryDepsSchema) errors.push(`schema must be ${binaryDepsSchema}`)
  if (!Array.isArray(manifest?.dependencies) || manifest.dependencies.length === 0) {
    errors.push('dependencies must be a non-empty array')
  }
  const providers = new Set()
  for (const dependency of manifest?.dependencies ?? []) {
    const label = nonEmptyString(dependency?.id) ? dependency.id : '<missing id>'
    if (!nonEmptyString(dependency?.id)) errors.push(`${label}: id must be set`)
    if (!safeToken(dependency?.provider)) errors.push(`${label}: provider must be a lowercase token`)
    if (!safeRepository(dependency?.repository)) errors.push(`${label}: repository must look like owner/repo`)
    if (!shaLike(dependency?.ref)) errors.push(`${label}: ref must be a pinned commit SHA`)
    if (!safeRelativePath(dependency?.workdir)) errors.push(`${label}: workdir must be a safe relative path`)
    if (!safeToken(dependency?.package)) errors.push(`${label}: package must be a safe package name`)
    if (!safeBinaryName(dependency?.binary)) errors.push(`${label}: binary must be a safe binary name`)
    if (!nonEmptyString(dependency?.license)) errors.push(`${label}: license must be set`)
    if (providers.has(dependency?.provider)) errors.push(`${label}: duplicate provider ${dependency.provider}`)
    providers.add(dependency?.provider)
  }
  if (errors.length > 0) {
    throw new Error([`Binary dependency manifest validation failed: ${manifestPath}`, ...errors.map((error) => `- ${error}`)].join('\n'))
  }
  return manifest
}

export function binaryDepsByProvider(manifest) {
  return new Map(manifest.dependencies.map((dependency) => [dependency.provider, dependency]))
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function assertExecutable(path, label = 'binary') {
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  const info = statSync(path)
  if (!info.isFile()) throw new Error(`${label} is not a file: ${path}`)
  if (!path.endsWith('.exe') && (info.mode & 0o111) === 0) {
    throw new Error(`${label} is not executable: ${path}`)
  }
}

export function providerEnvName(provider) {
  return `MOVSCRIPT_${provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_APP_SERVER_BIN`
}

function safeRepository(value) {
  return nonEmptyString(value) && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)
}

function safeRelativePath(value) {
  if (!nonEmptyString(value)) return false
  if (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) return false
  return !value.split(/[\\/]+/).some((part) => !part || part === '.' || part === '..')
}

function safeToken(value) {
  return nonEmptyString(value) && /^[a-z0-9][a-z0-9_.-]*$/.test(value)
}

function safeBinaryName(value) {
  return nonEmptyString(value) && /^[A-Za-z0-9_.-]+(?:\.exe)?$/.test(value)
}

function shaLike(value) {
  return nonEmptyString(value) && /^[a-f0-9]{40,64}$/i.test(value)
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}
