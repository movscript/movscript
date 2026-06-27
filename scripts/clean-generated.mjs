#!/usr/bin/env node
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

import { generatedCleanTargets, generatedPathCategories, isGeneratedDirectory } from '../tools/generated-paths.mjs'

const repoRoot = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const help = args.includes('--help') || args.includes('-h')
const requestedCategories = parseRequestedCategories(args)

if (help) {
  printUsage()
  process.exit(0)
}

if (requestedCategories.length === 0) {
  printUsage()
  process.exit(2)
}

const targets = new Set()
for (const category of requestedCategories) {
  for (const target of expandCleanTargets(category)) {
    targets.add(target)
  }
}

const sortedTargets = [...targets].sort()
for (const target of sortedTargets) {
  const relativePath = target.replace(`${repoRoot}/`, '')
  if (dryRun) {
    console.log(`[dry-run] remove ${relativePath}`)
    continue
  }
  rmSync(target, { force: true, recursive: true })
  console.log(`removed ${relativePath}`)
}

if (sortedTargets.length === 0) {
  console.log('No generated paths matched the requested clean categories.')
}

function parseRequestedCategories(rawArgs) {
  const categories = new Set()
  for (const arg of rawArgs) {
    if (arg === '--') continue
    if (!arg.startsWith('--')) continue
    if (arg === '--dry-run' || arg === '--help') continue
    const category = arg.slice(2)
    if (category === 'all') {
      for (const generatedCategory of generatedPathCategories) categories.add(generatedCategory)
      continue
    }
    if (category === 'dev-state') {
      categories.add('devState')
      continue
    }
    if (category === 'vendor-runtime') {
      categories.add('vendorRuntime')
      continue
    }
    if (!generatedPathCategories.includes(category)) {
      console.error(`Unknown clean category: ${category}`)
      process.exit(2)
    }
    categories.add(category)
  }
  return [...categories]
}

function expandCleanTargets(category) {
  const patterns = generatedCleanTargets[category] ?? []
  return patterns.flatMap((pattern) => expandPattern(pattern))
}

function expandPattern(pattern) {
  const normalizedPattern = pattern.replaceAll('\\', '/').replace(/^\.\//, '')
  if (normalizedPattern === '**/*.tsbuildinfo') {
    return findBySuffix(repoRoot, '.tsbuildinfo')
  }
  return expandSegments(repoRoot, normalizedPattern.split('/'))
}

function expandSegments(base, segments) {
  if (segments.length === 0) {
    return existsSync(base) ? [base] : []
  }

  const [segment, ...rest] = segments
  if (!segment) return expandSegments(base, rest)

  if (segment.includes('*')) {
    if (!isDirectory(base)) return []
    const matcher = globSegmentToRegExp(segment)
    return readdirSync(base, { withFileTypes: true }).flatMap((entry) => {
      if (!matcher.test(entry.name)) return []
      return expandSegments(resolve(base, entry.name), rest)
    })
  }

  return expandSegments(resolve(base, segment), rest)
}

function findBySuffix(directory, suffix) {
  if (!isDirectory(directory) || shouldSkipRecursiveSearch(directory)) return []
  const matches = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      matches.push(...findBySuffix(absolutePath, suffix))
    } else if (entry.isFile() && entry.name.endsWith(suffix)) {
      matches.push(absolutePath)
    }
  }
  return matches
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function shouldSkipRecursiveSearch(directory) {
  const relativePath = directory === repoRoot ? '' : directory.replace(`${repoRoot}/`, '').replaceAll('\\', '/')
  if (!relativePath) return false
  if (isGeneratedDirectory(relativePath)) return true
  return [
    '.git',
    '.movscript-dev',
    '.pnpm-store',
    '.venv',
    'apps/desktop/vendor',
    'node_modules',
    'services/data-service/vendor',
  ].some((skipPath) => relativePath === skipPath || relativePath.startsWith(`${skipPath}/`))
}

function globSegmentToRegExp(segment) {
  return new RegExp(`^${segment.split('*').map(escapeRegExp).join('.*')}$`)
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}

function printUsage() {
  console.error('Usage: node scripts/clean-generated.mjs [--build] [--stage] [--release] [--cache] [--dev-state] [--vendor-runtime] [--all] [--dry-run]')
}
