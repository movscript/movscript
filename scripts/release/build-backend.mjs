import { rmSync, cpSync, existsSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '../..')
const backendDir = resolve(repoRoot, 'apps/backend')
const binDir = resolve(backendDir, 'bin')

const targetOS = process.env.GOOS || process.platform
const isWindows = targetOS === 'win32' || targetOS === 'windows'
const serverName = isWindows ? 'server.exe' : 'server'
const outputPath = resolve(binDir, serverName)

mkdirSync(binDir, { recursive: true })
rmSync(outputPath, { force: true })

const result = spawnSync('go', ['build', '-o', outputPath, './cmd/server'], {
  cwd: backendDir,
  stdio: 'inherit',
  env: process.env,
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

if (!existsSync(outputPath)) {
  throw new Error(`backend binary was not created: ${outputPath}`)
}

if (isWindows) {
  const compatibilityPath = resolve(binDir, 'server')
  cpSync(outputPath, compatibilityPath)
}

console.log(`Built backend binary: ${outputPath}`)
