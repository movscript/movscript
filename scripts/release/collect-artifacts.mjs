import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(import.meta.dirname, '../..')

const allowedExtensions = new Set([
  '.dmg',
  '.zip',
  '.exe',
  '.msi',
  '.AppImage',
  '.deb',
  '.rpm',
  '.movpkg',
])

if (isDirectRun()) {
  runCollectArtifactsCli(repoRoot, process.env)
}

export function runCollectArtifactsCli(root = repoRoot, env = process.env, options = {}) {
  const {
    collect = collectArtifacts,
    exit = process.exit,
    log = console.log,
    logError = console.error,
  } = options
  try {
    const result = collect(root, { env })
    log(`Collected ${result.copied.length} release artifact(s) in ${result.outputDir}`)
    for (const path of result.copied) log(`- ${path}`)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
  }
}

export function collectArtifacts(root = repoRoot, options = {}) {
  const {
    env = process.env,
    outputDir = resolve(root, 'release-artifacts'),
    sources = defaultArtifactSources(root, env),
    artifactPrefix = normalizeArtifactPrefix(env.MOVSCRIPT_ARTIFACT_PREFIX?.trim() || ''),
  } = options

  rmSync(outputDir, { recursive: true, force: true })
  mkdirSync(outputDir, { recursive: true })

  const seen = new Map()
  const copied = []
  for (const source of sources) {
    if (!existsSync(source)) continue
    for (const name of readdirSync(source)) {
      if (!isReleaseAsset(name)) continue
      const from = resolve(source, name)
      if (!statSync(from).isFile()) continue
      const targetName = artifactPrefix ? `${artifactPrefix}-${basename(name)}` : basename(name)
      const previous = seen.get(targetName)
      if (previous) {
        throw new Error([
          `Duplicate release artifact name: ${targetName}`,
          `First: ${previous}`,
          `Second: ${from}`,
        ].join('\n'))
      }
      seen.set(targetName, from)
      const to = resolve(outputDir, targetName)
      copyFileSync(from, to)
      copied.push(to)
    }
  }

  if (copied.length === 0) {
    throw new Error('No release artifacts were collected.')
  }

  const lines = copied
    .sort()
    .map((path) => `${sha256(path)}  ${basename(path)}`)
  const checksumPath = resolve(outputDir, artifactPrefix ? `${artifactPrefix}-SHA256SUMS.txt` : 'SHA256SUMS.txt')
  writeFileSync(checksumPath, `${lines.join('\n')}\n`, 'utf8')

  return { copied, checksumPath, outputDir }
}

export function defaultArtifactSources(root = repoRoot, env = process.env) {
  return [
    resolve(root, 'apps/frontend/release'),
    ...(env.MOVSCRIPT_COLLECT_PLUGINS === '0' ? [] : [
      resolve(root, 'plugins/image-generator/dist'),
      resolve(root, 'plugins/video-generator/dist'),
    ]),
  ]
}

export function isReleaseAsset(name) {
  if (name.endsWith('.blockmap')) return false
  if ((name.endsWith('.yml') || name.endsWith('.yaml')) && name.startsWith('latest')) return true
  for (const ext of allowedExtensions) {
    if (name.endsWith(ext)) return true
  }
  return false
}

export function normalizeArtifactPrefix(value) {
  if (!value) return ''
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error('MOVSCRIPT_ARTIFACT_PREFIX may only contain letters, numbers, dot, underscore, and dash')
  }
  if (value === '.' || value === '..' || value.includes('..')) {
    throw new Error('MOVSCRIPT_ARTIFACT_PREFIX must not contain path traversal segments')
  }
  return value
}

export function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function isDirectRun() {
  return process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
}
