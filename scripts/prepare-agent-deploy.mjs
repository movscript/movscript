import { cpSync, existsSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = resolve(repoRoot, 'apps/agent')
const targetDir = resolve(repoRoot, 'apps/frontend/movscript-agent')
const pnpmEntrypoint = process.env.npm_execpath
const pnpmArgs = ['--dir', sourceDir, 'build']

function runPnpm(args) {
  if (pnpmEntrypoint && !/\.(cmd|bat|ps1)$/i.test(pnpmEntrypoint)) {
    return spawnSync(process.execPath, [pnpmEntrypoint, ...args], { stdio: 'inherit' })
  }

  return spawnSync(pnpmEntrypoint ?? 'pnpm', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}

if (!existsSync(sourceDir)) {
  throw new Error(`source directory not found: ${sourceDir}`)
}

const build = runPnpm(pnpmArgs)

if (build.error) {
  throw new Error(`failed to start agent bundle build from ${sourceDir}: ${build.error.message}`)
}
if (build.status !== 0) {
  const detail = build.signal
    ? `signal ${build.signal}`
    : typeof build.status === 'number'
      ? `exit code ${build.status}`
      : 'unknown exit status'
  throw new Error(`failed to build agent bundle from ${sourceDir}: ${detail}`)
}

rmSync(targetDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })

for (const entry of ['dist', 'catalog', 'package.json']) {
  const from = resolve(sourceDir, entry)
  if (!existsSync(from)) continue
  const to = resolve(targetDir, entry)
  cpSync(from, to, { recursive: true, dereference: true })
}
