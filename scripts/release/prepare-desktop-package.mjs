import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '../..')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
    ...options,
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

run('pnpm', ['run', 'build:packages'])
run('pnpm', ['run', 'build:admin'])
run('pnpm', ['run', 'build:backend'])
run('node', ['scripts/release/copy-admin-assets.mjs'])
