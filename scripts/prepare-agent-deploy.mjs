import { cpSync, existsSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = resolve(repoRoot, 'apps/agent')
const targetDir = resolve(repoRoot, 'apps/frontend/movscript-agent')

if (!existsSync(sourceDir)) {
  throw new Error(`source directory not found: ${sourceDir}`)
}

const build = spawnSync('pnpm', ['--dir', sourceDir, 'build'], { stdio: 'inherit' })
if (build.status !== 0) {
  throw new Error(`failed to build agent bundle from ${sourceDir}`)
}

rmSync(targetDir, { recursive: true, force: true })

for (const entry of ['dist', 'catalog', 'package.json']) {
  const from = resolve(sourceDir, entry)
  if (!existsSync(from)) continue
  const to = resolve(targetDir, entry)
  cpSync(from, to, { recursive: true, dereference: true })
}
