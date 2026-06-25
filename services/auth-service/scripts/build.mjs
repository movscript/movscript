import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(import.meta.dirname, '../../..')

if (isDirectRun(import.meta.url)) {
  buildAuthService(repoRoot)
}

export function buildAuthService(root = repoRoot) {
  const authServiceDir = resolve(root, 'services/auth-service')
  const binDir = resolve(authServiceDir, 'bin')
  const targetOS = process.env.GOOS || process.platform
  const targetArch = process.env.GOARCH || process.arch
  const goCache = process.env.GOCACHE || resolve(tmpdir(), 'movscript-go-cache')
  const isWindows = targetOS === 'win32' || targetOS === 'windows'
  const binaryName = isWindows ? 'movscript-auth-service.exe' : 'movscript-auth-service'
  const outputPath = resolve(binDir, binaryName)

  console.log(`[build-auth-service] Platform: ${process.platform} ${process.arch}`)
  console.log(`[build-auth-service] Target: ${targetOS} ${targetArch}`)
  console.log(`[build-auth-service] Go cache: ${goCache}`)
  console.log(`[build-auth-service] Auth Service directory: ${authServiceDir}`)
  console.log(`[build-auth-service] Output path: ${outputPath}`)

  mkdirSync(binDir, { recursive: true })
  rmSync(outputPath, { force: true })

  const startedAt = Date.now()
  console.log('[build-auth-service] Command: go build -o <output> ./cmd/auth-service')

  const result = spawnSync('go', ['build', '-o', outputPath, './cmd/auth-service'], {
    cwd: authServiceDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      GOCACHE: goCache,
    },
  })

  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1)

  if (result.error) {
    console.error('[build-auth-service] Failed to start go build')
    console.error(`[build-auth-service] Error: ${result.error.message}`)
    console.error(`[build-auth-service] Code: ${result.error.code ?? 'unknown'}`)
    process.exit(1)
  }

  if (result.status !== 0 || result.signal) {
    console.error('[build-auth-service] go build failed')
    console.error(`[build-auth-service] Exit status: ${result.status ?? 'none'}`)
    console.error(`[build-auth-service] Signal: ${result.signal ?? 'none'}`)
    console.error(`[build-auth-service] Elapsed: ${elapsedSeconds}s`)
    process.exit(result.status ?? 1)
  }

  if (!existsSync(outputPath)) {
    throw new Error(`auth-service binary was not created: ${outputPath}`)
  }

  console.log(`[build-auth-service] Built auth-service binary: ${outputPath} (${elapsedSeconds}s)`)
}

function isDirectRun(metaUrl) {
  return process.argv[1] && fileURLToPath(metaUrl) === resolve(process.argv[1])
}
