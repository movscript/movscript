import { rmSync, existsSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(import.meta.dirname, '../../..')

if (isDirectRun(import.meta.url)) {
  const [command = 'build'] = process.argv.slice(2)
  if (command === 'build') {
    buildDataService(repoRoot)
  } else {
    console.error('usage: node services/data-service/scripts/build.mjs [build]')
    process.exit(2)
  }
}

export function buildDataService(root = repoRoot) {
  const dataServiceDir = resolve(root, 'services/data-service')
  const binDir = resolve(dataServiceDir, 'bin')
  const targetOS = process.env.GOOS || process.platform
  const targetArch = process.env.GOARCH || process.arch
  const goCache = process.env.GOCACHE || resolve(tmpdir(), 'movscript-go-cache')
  const isWindows = targetOS === 'win32' || targetOS === 'windows'
  const serverName = isWindows ? 'movscript-server.exe' : 'movscript-server'
  const outputPath = resolve(binDir, serverName)

  console.log(`[build-data-service] Platform: ${process.platform} ${process.arch}`)
  console.log(`[build-data-service] Target: ${targetOS} ${targetArch}`)
  console.log(`[build-data-service] Go cache: ${goCache}`)
  console.log(`[build-data-service] Data Service directory: ${dataServiceDir}`)
  console.log(`[build-data-service] Output path: ${outputPath}`)

  mkdirSync(binDir, { recursive: true })
  rmSync(outputPath, { force: true })
  rmSync(resolve(binDir, isWindows ? 'server.exe' : 'server'), { force: true })
  if (isWindows) rmSync(resolve(binDir, 'server'), { force: true })

  const startedAt = Date.now()
  console.log('[build-data-service] Command: go build -o <output> ./cmd/server')

  const result = spawnSync('go', ['build', '-o', outputPath, './cmd/server'], {
    cwd: dataServiceDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      GOCACHE: goCache,
    },
  })

  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1)

  if (result.error) {
    console.error('[build-data-service] Failed to start go build')
    console.error(`[build-data-service] Error: ${result.error.message}`)
    console.error(`[build-data-service] Code: ${result.error.code ?? 'unknown'}`)
    process.exit(1)
  }

  if (result.status !== 0 || result.signal) {
    console.error('[build-data-service] go build failed')
    console.error(`[build-data-service] Exit status: ${result.status ?? 'none'}`)
    console.error(`[build-data-service] Signal: ${result.signal ?? 'none'}`)
    console.error(`[build-data-service] Elapsed: ${elapsedSeconds}s`)
    process.exit(result.status ?? 1)
  }

  if (!existsSync(outputPath)) {
    throw new Error(`data-service binary was not created: ${outputPath}`)
  }

  console.log(`[build-data-service] Built data-service binary: ${outputPath} (${elapsedSeconds}s)`)
}

function isDirectRun(metaUrl) {
  return process.argv[1] && fileURLToPath(metaUrl) === resolve(process.argv[1])
}
