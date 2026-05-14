import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '../..')
const isWindows = process.platform === 'win32'
const pnpmCommand = 'pnpm'

const steps = [
  ['Build workspace packages', pnpmCommand, ['run', 'build:packages']],
  ['Build admin app', pnpmCommand, ['run', 'build:admin']],
  ['Build backend binary', pnpmCommand, ['run', 'build:backend']],
  ['Copy admin assets into backend bundle', 'node', ['scripts/release/copy-admin-assets.mjs']],
]

function run(stepName, command, args, options = {}) {
  const startedAt = Date.now()
  console.log(`[prepare-desktop] Starting: ${stepName}`)
  console.log(`[prepare-desktop] Command: ${command} ${args.join(' ')}`)

  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
    shell: isWindows,
    ...options,
  })

  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1)

  if (result.error) {
    console.error(`[prepare-desktop] Failed to start: ${stepName}`)
    console.error(`[prepare-desktop] Error: ${result.error.message}`)
    console.error(`[prepare-desktop] Code: ${result.error.code ?? 'unknown'}`)
    process.exit(1)
  }

  if (result.status !== 0 || result.signal) {
    console.error(`[prepare-desktop] Failed: ${stepName}`)
    console.error(`[prepare-desktop] Exit status: ${result.status ?? 'none'}`)
    console.error(`[prepare-desktop] Signal: ${result.signal ?? 'none'}`)
    console.error(`[prepare-desktop] Elapsed: ${elapsedSeconds}s`)
    process.exit(result.status ?? 1)
  }

  console.log(`[prepare-desktop] Finished: ${stepName} (${elapsedSeconds}s)`)
}

console.log('[prepare-desktop] Preparing desktop package prerequisites')
console.log(`[prepare-desktop] Platform: ${process.platform} ${process.arch}`)
console.log(`[prepare-desktop] Node: ${process.version}`)
console.log(`[prepare-desktop] Repository root: ${repoRoot}`)

for (const [stepName, command, args] of steps) {
  run(stepName, command, args)
}

console.log('[prepare-desktop] Desktop package prerequisites are ready')
