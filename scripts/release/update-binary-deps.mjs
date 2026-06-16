#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

import { isDirectRun } from './release-common.mjs'
import {
  binaryDepsByProvider,
  readBinaryDepsManifest,
  validateBinaryDepsManifest,
} from './binary-deps-common.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')
const defaultManifest = 'binary-deps.manifest.json'
const defaultBranch = 'main'

if (isDirectRun(import.meta.url)) {
  runUpdateBinaryDepsCli(repoRoot, process.env, process.argv.slice(2))
}

export function runUpdateBinaryDepsCli(root = repoRoot, env = process.env, args = [], options = {}) {
  const {
    exit = process.exit,
    log = console.log,
    logError = console.error,
    update = updateBinaryDepsManifests,
  } = options
  try {
    const parsed = parseArgs(args, env, root)
    const result = update(parsed.root, parsed, env)
    for (const item of result.resolved) {
      log(`${item.provider}: ${item.previousRef} -> ${item.ref} (${item.repository}@${item.branch})`)
    }
    for (const manifestPath of result.updatedManifests) {
      log(`${parsed.dryRun ? 'Would update' : 'Updated'} ${manifestPath}`)
    }
    if (result.updatedManifests.length === 0) log('No binary dependency manifest changes needed.')
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
  }
}

export function updateBinaryDepsManifests(root = repoRoot, options = {}, env = process.env) {
  const manifestPaths = manifestPathsFor(root, options)
  const primaryManifestPath = manifestPaths[0]
  const primary = readBinaryDepsManifest(dirname(primaryManifestPath), primaryManifestPath.split(/[\\/]/).pop())
  const resolved = primary.dependencies.map((dependency) => {
    const branch = options.branch ?? defaultBranch
    const ref = resolveRemoteCommit(dependency.repository, branch, env, options)
    return {
      branch,
      previousRef: dependency.ref,
      provider: dependency.provider,
      ref,
      repository: dependency.repository,
    }
  })
  const refsByProvider = new Map(resolved.map((item) => [item.provider, item.ref]))
  const updatedManifests = []

  for (const manifestPath of manifestPaths) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    validateBinaryDepsManifest(manifest, manifestPath)
    const depsByProvider = binaryDepsByProvider(manifest)
    for (const item of resolved) {
      if (!depsByProvider.has(item.provider)) {
        throw new Error(`Manifest ${manifestPath} is missing binary dependency provider ${item.provider}`)
      }
    }
    let changed = false
    const next = {
      ...manifest,
      dependencies: manifest.dependencies.map((dependency) => {
        const ref = refsByProvider.get(dependency.provider)
        if (!ref || dependency.ref === ref) return dependency
        changed = true
        return { ...dependency, ref }
      }),
    }
    validateBinaryDepsManifest(next, manifestPath)
    if (changed) {
      updatedManifests.push(manifestPath)
      if (!options.dryRun) writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    }
  }

  return { resolved, updatedManifests }
}

export function resolveRemoteCommit(repository, branch = defaultBranch, env = process.env, options = {}) {
  const remote = `https://github.com/${repository}.git`
  const args = ['ls-remote', remote, `refs/heads/${branch}`]
  const token = options.token ?? env.MOVSCRIPT_DEPS_TOKEN ?? env.GITHUB_TOKEN
  const authHeader = token ? `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}` : undefined
  const gitArgs = token
    ? ['-c', `http.https://github.com/.extraheader=${authHeader}`, ...args]
    : args
  const result = (options.spawn ?? spawnSync)('git', gitArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })
  if (result.error || result.status !== 0) {
    throw new Error(`Unable to resolve ${repository}@${branch}: ${result.error?.message ?? result.stderr}`)
  }
  const sha = result.stdout.trim().split(/\s+/)[0]
  if (!/^[a-f0-9]{40,64}$/i.test(sha)) {
    throw new Error(`Unable to resolve ${repository}@${branch}: git ls-remote did not return a commit SHA`)
  }
  return sha
}

function manifestPathsFor(root, options) {
  const paths = [resolve(root, options.manifest ?? defaultManifest)]
  for (const extraManifest of normalizeExtraManifests(options.extraManifests)) {
    const extraManifestPath = resolve(root, extraManifest)
    if (existsSync(extraManifestPath) && !paths.includes(extraManifestPath)) {
      paths.push(extraManifestPath)
    }
  }
  return paths
}

function parseArgs(args, env, root) {
  return {
    branch: argValue(args, '--branch') ?? env.MOVSCRIPT_BINARY_DEPS_BRANCH ?? defaultBranch,
    dryRun: args.includes('--dry-run') || env.MOVSCRIPT_BINARY_DEPS_DRY_RUN === '1',
    extraManifests: [
      ...argValues(args, '--extra-manifest'),
      ...envList(env.MOVSCRIPT_BINARY_DEPS_EXTRA_MANIFESTS),
    ],
    manifest: argValue(args, '--manifest') ?? env.MOVSCRIPT_BINARY_DEPS_MANIFEST ?? defaultManifest,
    root: resolve(argValue(args, '--root') ?? env.MOVSCRIPT_BINARY_DEPS_ROOT ?? root),
    token: argValue(args, '--token') ?? env.MOVSCRIPT_DEPS_TOKEN ?? env.GITHUB_TOKEN,
  }
}

function argValue(args, name) {
  const equalPrefix = `${name}=`
  const equalValue = args.find((arg) => arg.startsWith(equalPrefix))
  if (equalValue) return equalValue.slice(equalPrefix.length)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

function argValues(args, name) {
  const values = []
  const equalPrefix = `${name}=`
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg.startsWith(equalPrefix)) {
      values.push(arg.slice(equalPrefix.length))
    } else if (arg === name && args[index + 1]) {
      values.push(args[index + 1])
      index += 1
    }
  }
  return values.filter(Boolean)
}

function envList(value) {
  if (!value) return []
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function normalizeExtraManifests(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(Boolean)
  return [value]
}
