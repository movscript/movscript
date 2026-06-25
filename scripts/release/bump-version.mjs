#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { isDirectRun } from './release-common.mjs'

export const releaseVersionPackagePaths = Object.freeze([
  'package.json',
  'apps/desktop/package.json',
  'packages/core/package.json',
  'packages/decision/package.json',
  'packages/engine/package.json',
  'packages/interpreter/package.json',
  'packages/language/package.json',
  'packages/prompt/package.json',
  'packages/workspace/package.json',
])

const repoRoot = resolve(import.meta.dirname, '../..')

if (isDirectRun(import.meta.url)) {
  runBumpReleaseVersionCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}

export async function runBumpReleaseVersionCli(args = [], options = {}) {
  const {
    root = repoRoot,
    log = console.log,
  } = options
  const input = parseBumpReleaseVersionArgs(args)
  const result = await bumpReleaseVersion(root, input.version, { dryRun: input.dryRun })
  const action = input.dryRun ? 'would update' : 'updated'
  log(`Release version ${action} to ${result.version} in ${result.packages.length} package manifest(s).`)
  for (const packagePath of result.packages) {
    log(`- ${packagePath}`)
  }
  return result
}

export function parseBumpReleaseVersionArgs(args = []) {
  const dryRun = args.includes('--dry-run')
  const version = args.find((arg) => !arg.startsWith('--'))
  return {
    dryRun,
    version: requireReleaseVersion(version),
  }
}

export async function bumpReleaseVersion(root = repoRoot, version, options = {}) {
  const nextVersion = requireReleaseVersion(version)
  const dryRun = options.dryRun === true
  const updated = []
  for (const packagePath of releaseVersionPackagePaths) {
    const absolutePath = resolve(root, packagePath)
    const packageJson = await readJson(absolutePath)
    if (packageJson.version !== nextVersion) {
      packageJson.version = nextVersion
      if (!dryRun) await writeJson(absolutePath, packageJson)
    }
    updated.push(packagePath)
  }
  return {
    version: nextVersion,
    packages: updated,
    dryRun,
  }
}

function requireReleaseVersion(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Release version is required, for example: pnpm run release -- bump-version 0.1.3')
  }
  const version = value.trim().replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Release version must be a SemVer-like version, got: ${value}`)
  }
  return version
}

async function readJson(path) {
  const parsed = JSON.parse(await readFile(path, 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Expected JSON object: ${path}`)
  }
  return parsed
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}
