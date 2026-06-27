#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const repoRoot = resolve(import.meta.dirname, '..')
const workspaceRoots = ['apps', 'packages', 'services', 'surface']
const packageManifests = discoverWorkspacePackages()
const packagesByName = new Map(packageManifests.map((manifest) => [manifest.json.name, manifest]))
const errors = []

for (const manifest of packageManifests) {
  checkPackageIdentity(manifest)
  checkScripts(manifest)
  checkLocalDependencies(manifest)
  checkPublicPackageMetadata(manifest)
}

if (errors.length > 0) {
  for (const error of errors) console.error(`workspace-packages: ${error}`)
  process.exit(1)
}

console.log(`Workspace package contract passed (${packageManifests.length} packages).`)

function discoverWorkspacePackages() {
  const manifests = []
  for (const root of workspaceRoots) {
    const absoluteRoot = resolve(repoRoot, root)
    if (!existsSync(absoluteRoot)) continue
    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const manifestPath = join(absoluteRoot, entry.name, 'package.json')
      if (!existsSync(manifestPath)) continue
      const json = JSON.parse(readFileSync(manifestPath, 'utf8'))
      manifests.push({
        dir: `${root}/${entry.name}`,
        path: manifestPath,
        json,
      })
    }
  }
  return manifests.sort((left, right) => left.dir.localeCompare(right.dir))
}

function checkPackageIdentity(manifest) {
  const { json, dir } = manifest
  if (typeof json.name !== 'string' || json.name.length === 0) {
    errors.push(`${dir}/package.json must define name`)
  }
  if (typeof json.version !== 'string' || json.version.length === 0) {
    errors.push(`${dir}/package.json must define version`)
  }
}

function checkScripts(manifest) {
  const { json, dir } = manifest
  const scripts = json.scripts ?? {}
  if (existsSync(resolve(repoRoot, dir, 'tsconfig.json')) && typeof scripts.typecheck !== 'string') {
    errors.push(`${dir}/package.json has tsconfig.json but no typecheck script`)
  }
  if (manifestReferencesDist(json) && typeof scripts.build !== 'string') {
    errors.push(`${dir}/package.json exports dist files but no build script`)
  }
}

function checkLocalDependencies(manifest) {
  const { json, dir } = manifest
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = json[field] ?? {}
    for (const [name, range] of Object.entries(deps)) {
      if (!packagesByName.has(name)) continue
      if (field === 'peerDependencies') continue
      if (range !== 'workspace:*') {
        errors.push(`${dir}/package.json ${field}.${name} must use workspace:*`)
      }
    }
  }
}

function checkPublicPackageMetadata(manifest) {
  const { json, dir } = manifest
  if (json.private === true) return
  if (typeof json.license !== 'string' || json.license.length === 0) {
    errors.push(`${dir}/package.json public package must define license`)
  }
  if (!Array.isArray(json.files) || json.files.length === 0) {
    errors.push(`${dir}/package.json public package must define files`)
  }
  if (!json.exports) {
    errors.push(`${dir}/package.json public package must define exports`)
  }
}

function manifestReferencesDist(value) {
  if (typeof value === 'string') return value.includes('dist') || value.includes('dist-lib')
  if (Array.isArray(value)) return value.some((item) => manifestReferencesDist(item))
  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => manifestReferencesDist(item))
  }
  return false
}
