#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  assertDesktopPlatform,
  isDirectRun,
  parseDesktopPlatformArg,
} from './release-common.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')
const defaultReleaseNotesPath = '.github/release-workspace-notes.md'
const desktopPackagePath = 'apps/frontend/package.json'
const rootPackagePath = 'package.json'
const movscriptLangPackages = new Set([
  '@movscript/interpreter',
  '@movscript/engine',
  '@movscript/language',
  '@movscript/workspace',
])

if (isDirectRun(import.meta.url)) {
  runVerifyReleaseReadinessCli(repoRoot, process.env, process.argv.slice(2))
}

export function runVerifyReleaseReadinessCli(root = repoRoot, env = process.env, args = [], options = {}) {
  const {
    exit = process.exit,
    log = console.log,
    logError = console.error,
  } = options

  try {
    const result = verifyReleaseReadiness(root, {
      env,
      tag: argValue(args, '--tag') ?? releaseTagFromEnv(env),
      platform: argValue(args, '--platform') ?? env.MOVSCRIPT_RELEASE_PLATFORM,
      releaseNotesPath: argValue(args, '--release-notes') ?? env.MOVSCRIPT_RELEASE_NOTES_PATH,
      requireSigning: args.includes('--require-signing') || env.MOVSCRIPT_RELEASE_REQUIRE_SIGNING === '1',
    })
    log(`Release readiness verification passed (${result.checks.length} checks).`)
    for (const check of result.checks) log(`- ${check}`)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
  }
}

export function verifyReleaseReadiness(root = repoRoot, options = {}) {
  const {
    env = process.env,
    tag = releaseTagFromEnv(env),
    platform = env.MOVSCRIPT_RELEASE_PLATFORM,
    releaseNotesPath = defaultReleaseNotesPath,
    requireSigning = env.MOVSCRIPT_RELEASE_REQUIRE_SIGNING === '1',
  } = options
  const checks = []
  const rootPackage = readPackageJSON(root, rootPackagePath)
  const desktopPackage = readPackageJSON(root, desktopPackagePath)

  if (!nonEmptyString(rootPackage.version)) {
    throw new Error(`${rootPackagePath} must declare a version`)
  }
  if (desktopPackage.version !== rootPackage.version) {
    throw new Error(`${desktopPackagePath} version (${desktopPackage.version ?? '<missing>'}) must match ${rootPackagePath} version (${rootPackage.version})`)
  }
  checks.push(`desktop package version ${desktopPackage.version} matches root package`)

  const releaseTag = normalizeOptionalTag(tag)
  if (releaseTag) {
    const expectedTag = `v${rootPackage.version}`
    if (releaseTag !== expectedTag) {
      throw new Error(`Release tag ${releaseTag} must match package version ${expectedTag}`)
    }
    checks.push(`release tag ${releaseTag} matches package version`)
  } else {
    checks.push('release tag check skipped outside a tag release')
  }

  const absoluteReleaseNotes = resolve(root, releaseNotesPath)
  if (!existsSync(absoluteReleaseNotes)) {
    throw new Error(`Release notes file is missing: ${releaseNotesPath}`)
  }
  checks.push(`release notes file exists: ${releaseNotesPath}`)

  const mutableDependencyErrors = mutableMovscriptLangDependencyErrors(root)
  if (mutableDependencyErrors.length > 0) {
    throw new Error([
      'Release packages must not depend on mutable movscript-lang specs.',
      ...mutableDependencyErrors.map((error) => `- ${error}`),
      'Pin a version or use workspace:* before running a release.',
    ].join('\n'))
  }
  checks.push('movscript-lang dependencies are pinned or workspace-local')

  if (requireSigning) {
    const signingPlatform = platform ? parseDesktopPlatformArg([`--platform=${platform}`], process.platform, 'release signing') : process.platform
    assertDesktopPlatform(signingPlatform, 'release signing')
    const signingChecks = verifySigningEnvironment(signingPlatform, env)
    checks.push(...signingChecks)
  } else {
    checks.push('signing config check skipped (set MOVSCRIPT_RELEASE_REQUIRE_SIGNING=1 to enforce)')
  }

  return { checks }
}

export function verifySigningEnvironment(platform = process.platform, env = process.env) {
  if (platform === 'linux') return [`${platform} signing gate has no required secret configuration`]
  const missing = []
  if (!nonEmptyString(env.CSC_LINK)) missing.push('CSC_LINK')
  if (!nonEmptyString(env.CSC_KEY_PASSWORD)) missing.push('CSC_KEY_PASSWORD')
  if (platform === 'darwin' && !hasAppleNotarizationCredentials(env)) {
    missing.push('APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID or APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER')
  }
  if (missing.length > 0) {
    throw new Error(`Release signing is required for ${platform}, but missing: ${missing.join(', ')}`)
  }
  return [`${platform} signing credentials are configured`]
}

function hasAppleNotarizationCredentials(env) {
  const appleId = nonEmptyString(env.APPLE_ID) &&
    nonEmptyString(env.APPLE_APP_SPECIFIC_PASSWORD) &&
    nonEmptyString(env.APPLE_TEAM_ID)
  const apiKey = nonEmptyString(env.APPLE_API_KEY) &&
    nonEmptyString(env.APPLE_API_KEY_ID) &&
    nonEmptyString(env.APPLE_API_ISSUER)
  return appleId || apiKey
}

function mutableMovscriptLangDependencyErrors(root) {
  const errors = []
  for (const packagePath of [rootPackagePath, 'packages/core/package.json', 'apps/cli/package.json']) {
    const packageJson = readPackageJSON(root, packagePath)
    const dependencies = {
      ...(isRecord(packageJson.dependencies) ? packageJson.dependencies : {}),
      ...(isRecord(packageJson.devDependencies) ? packageJson.devDependencies : {}),
      ...(isRecord(packageJson.optionalDependencies) ? packageJson.optionalDependencies : {}),
    }
    for (const [name, spec] of Object.entries(dependencies)) {
      if (!movscriptLangPackages.has(name)) continue
      if (spec === 'latest' || String(spec).startsWith('link:')) {
        errors.push(`${packagePath}: ${name} uses ${spec}`)
      }
    }
  }
  return errors
}

function normalizeOptionalTag(value) {
  const tag = String(value ?? '').trim()
  if (!tag || tag === 'main' || tag === 'master') return ''
  if (!/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tag)) {
    throw new Error(`Release tag must be a semver tag like v0.1.0, got ${tag}`)
  }
  return tag
}

function releaseTagFromEnv(env) {
  if (nonEmptyString(env.RELEASE_TAG)) return env.RELEASE_TAG
  if (env.GITHUB_REF_TYPE === 'tag' && nonEmptyString(env.GITHUB_REF_NAME)) return env.GITHUB_REF_NAME
  return ''
}

function readPackageJSON(root, path) {
  try {
    const parsed = JSON.parse(readFileSync(resolve(root, path), 'utf8'))
    if (!isRecord(parsed)) throw new Error('expected a JSON object')
    return parsed
  } catch (error) {
    throw new Error(`Unable to read ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function argValue(args, name) {
  const equalPrefix = `${name}=`
  const equalValue = args.find((arg) => arg.startsWith(equalPrefix))
  if (equalValue) return equalValue.slice(equalPrefix.length)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}
