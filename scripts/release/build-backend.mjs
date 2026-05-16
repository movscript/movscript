import { rmSync, cpSync, existsSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '../..')
const backendDir = resolve(repoRoot, 'apps/backend')
const binDir = resolve(backendDir, 'bin')

const targetOS = process.env.GOOS || process.platform
const targetArch = process.env.GOARCH || process.arch
const isWindows = targetOS === 'win32' || targetOS === 'windows'
const serverName = isWindows ? 'server.exe' : 'server'
const outputPath = resolve(binDir, serverName)

console.log(`[build-backend] Platform: ${process.platform} ${process.arch}`)
console.log(`[build-backend] Target: ${targetOS} ${targetArch}`)
console.log(`[build-backend] Backend directory: ${backendDir}`)
console.log(`[build-backend] Output path: ${outputPath}`)

mkdirSync(binDir, { recursive: true })
rmSync(outputPath, { force: true })

const startedAt = Date.now()
console.log('[build-backend] Command: go build -o <output> ./cmd/server')

const result = spawnSync('go', ['build', '-o', outputPath, './cmd/server'], {
  cwd: backendDir,
  stdio: 'inherit',
  env: process.env,
})

const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1)

if (result.error) {
  console.error('[build-backend] Failed to start go build')
  console.error(`[build-backend] Error: ${result.error.message}`)
  console.error(`[build-backend] Code: ${result.error.code ?? 'unknown'}`)
  process.exit(1)
}

if (result.status !== 0 || result.signal) {
  console.error('[build-backend] go build failed')
  console.error(`[build-backend] Exit status: ${result.status ?? 'none'}`)
  console.error(`[build-backend] Signal: ${result.signal ?? 'none'}`)
  console.error(`[build-backend] Elapsed: ${elapsedSeconds}s`)
  process.exit(result.status ?? 1)
}

if (!existsSync(outputPath)) {
  throw new Error(`backend binary was not created: ${outputPath}`)
}

if (isWindows) {
  const compatibilityPath = resolve(binDir, 'server')
  cpSync(outputPath, compatibilityPath)
}

console.log(`[build-backend] Built backend binary: ${outputPath} (${elapsedSeconds}s)`)
