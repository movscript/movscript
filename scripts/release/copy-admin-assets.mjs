import { cpSync, existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(import.meta.dirname, '../..')

if (isDirectRun()) {
  copyAdminAssets(repoRoot)
}

export function copyAdminAssets(root = repoRoot) {
  const source = resolve(root, 'apps/admin/dist')
  const target = resolve(root, 'apps/backend/bin/admin')

  if (!existsSync(source)) {
    throw new Error(`admin build output does not exist: ${source}`)
  }

  rmSync(target, { recursive: true, force: true })
  cpSync(source, target, { recursive: true })

  console.log(`Copied admin assets: ${source} -> ${target}`)
}

function isDirectRun() {
  return process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
}
