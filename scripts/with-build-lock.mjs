import { mkdirSync, rmSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [, , lockName, separator, ...command] = process.argv

if (!lockName || separator !== '--' || command.length === 0) {
  console.error('usage: node scripts/with-build-lock.mjs <lock-name> -- <command> [args...]')
  process.exit(2)
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lockRoot = resolve(repoRoot, 'node_modules/.cache/movscript-build-locks')
const lockDir = resolve(lockRoot, lockName.replace(/[^a-zA-Z0-9._-]/g, '_'))
const staleMs = Number(process.env.MOVSCRIPT_BUILD_LOCK_STALE_MS ?? 10 * 60 * 1000)
const deadline = Date.now() + Number(process.env.MOVSCRIPT_BUILD_LOCK_TIMEOUT_MS ?? 2 * 60 * 1000)

mkdirSync(lockRoot, { recursive: true })

while (true) {
  try {
    mkdirSync(lockDir)
    break
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    try {
      const ageMs = Date.now() - Number(lockMtimeMs(lockDir))
      if (Number.isFinite(ageMs) && ageMs > staleMs) {
        rmSync(lockDir, { recursive: true, force: true })
        continue
      }
    } catch {
      rmSync(lockDir, { recursive: true, force: true })
      continue
    }
    if (Date.now() > deadline) {
      console.error(`timed out waiting for build lock: ${lockName}`)
      process.exit(1)
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250)
  }
}

try {
  const result = spawnSync(command[0], command.slice(1), {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  rmSync(lockDir, { recursive: true, force: true })
}

function lockMtimeMs(path) {
  return statSync(path).mtimeMs
}
