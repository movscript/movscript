#!/usr/bin/env node
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { isDirectRun } from './release-common.mjs'
import { readBinaryDepsManifest } from './binary-deps-common.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')

if (isDirectRun(import.meta.url)) {
  runResolveBinaryDepsCli(repoRoot, process.env, process.argv.slice(2))
}

export function runResolveBinaryDepsCli(root = repoRoot, env = process.env, args = [], options = {}) {
  const {
    exit = process.exit,
    log = console.log,
    logError = console.error,
  } = options
  try {
    const parsed = parseArgs(args, env)
    const result = resolveBinaryDeps(parsed.root, parsed.manifest)
    if (parsed.githubOutput) writeGithubOutput(parsed.githubOutput, result.outputs)
    log(`Resolved ${result.dependencies.length} binary dependency ref(s).`)
    for (const dependency of result.dependencies) {
      log(`- ${dependency.provider}: ${dependency.repository}@${dependency.ref}`)
    }
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
  }
}

export function resolveBinaryDeps(root = repoRoot, manifestPath = 'binary-deps.manifest.json') {
  const manifest = readBinaryDepsManifest(root, manifestPath)
  const outputs = {}
  for (const dependency of manifest.dependencies) {
    outputs[`${dependency.provider}_repository`] = dependency.repository
    outputs[`${dependency.provider}_ref`] = dependency.ref
  }
  return { dependencies: manifest.dependencies, outputs }
}

function writeGithubOutput(path, outputs) {
  const lines = []
  for (const [key, value] of Object.entries(outputs)) {
    lines.push(`${key}=${value}`)
  }
  appendFileSync(path, `${lines.join('\n')}\n`, 'utf8')
}

function parseArgs(args, env) {
  return {
    githubOutput: argValue(args, '--github-output') ?? env.GITHUB_OUTPUT,
    manifest: argValue(args, '--manifest') ?? env.MOVSCRIPT_BINARY_DEPS_MANIFEST ?? 'binary-deps.manifest.json',
    root: resolve(argValue(args, '--root') ?? env.MOVSCRIPT_BINARY_DEPS_ROOT ?? repoRoot),
  }
}

function argValue(args, name) {
  const equalPrefix = `${name}=`
  const equalValue = args.find((arg) => arg.startsWith(equalPrefix))
  if (equalValue) return equalValue.slice(equalPrefix.length)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
