import { cpSync, existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '../..')
const source = resolve(repoRoot, 'apps/admin/dist')
const target = resolve(repoRoot, 'apps/backend/bin/admin')

if (!existsSync(source)) {
  throw new Error(`admin build output does not exist: ${source}`)
}

rmSync(target, { recursive: true, force: true })
cpSync(source, target, { recursive: true })

console.log(`Copied admin assets: ${source} -> ${target}`)
