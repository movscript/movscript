#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(appRoot, '../..')
const draftSchemasRoot = resolve(repoRoot, 'packages/draft-schemas')

await withBuildLock('movscript-agent-build', async () => {
  if (draftSchemasBuildIsStale()) {
    run('pnpm', ['--filter', '@movscript/draft-schemas', 'build'])
  }
  rmSync(resolve(appRoot, 'dist'), { recursive: true, force: true })
  run('tsc', ['-p', 'tsconfig.build.json'])

  await build({
    absWorkingDir: appRoot,
    entryPoints: ['src/server.ts'],
    outfile: 'dist/server.bundle.js',
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    sourcemap: true,
    banner: {
      js: "import { createRequire } from 'node:module';const require=createRequire(import.meta.url);",
    },
  })
})

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: appRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error) throw result.error
  if (result.status !== 0 || result.signal) {
    const detail = result.signal
      ? `signal ${result.signal}`
      : `exit code ${result.status ?? 1}`
    throw new Error(`${command} ${args.join(' ')} failed with ${detail}`)
  }
}

function draftSchemasBuildIsStale() {
  const outputFiles = [
    resolve(draftSchemasRoot, 'dist/index.cjs'),
    resolve(draftSchemasRoot, 'dist/index.d.ts'),
    resolve(draftSchemasRoot, 'dist/index.js'),
  ]
  if (outputFiles.some((file) => !existsSync(file))) return true

  const oldestOutputMtime = Math.min(...outputFiles.map((file) => statSync(file).mtimeMs))
  const sourceMtime = newestMtime([
    resolve(draftSchemasRoot, 'package.json'),
    resolve(draftSchemasRoot, 'src'),
  ])
  return sourceMtime > oldestOutputMtime
}

function newestMtime(paths) {
  let newest = 0
  for (const path of paths) {
    const stat = statSync(path)
    newest = Math.max(newest, stat.mtimeMs)
    if (!stat.isDirectory()) continue
    for (const entry of readdirSync(path)) {
      newest = Math.max(newest, newestMtime([resolve(path, entry)]))
    }
  }
  return newest
}

async function withBuildLock(lockName, task) {
  const lockRoot = resolve(repoRoot, 'node_modules/.cache/movscript-build-locks')
  const lockDir = resolve(lockRoot, lockName.replace(/[^a-zA-Z0-9._-]/g, '_'))
  const ownerPath = join(lockDir, 'owner.json')
  const staleMs = Number(process.env.MOVSCRIPT_BUILD_LOCK_STALE_MS ?? 10 * 60 * 1000)
  const deadline = Date.now() + Number(process.env.MOVSCRIPT_BUILD_LOCK_TIMEOUT_MS ?? 2 * 60 * 1000)

  mkdirSync(lockRoot, { recursive: true })

  while (true) {
    try {
      mkdirSync(lockDir)
      writeLockOwner(ownerPath)
      break
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      if (lockOwnerIsDead(ownerPath)) {
        rmSync(lockDir, { recursive: true, force: true })
        continue
      }
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
        throw new Error(`timed out waiting for build lock: ${lockName}`)
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250)
    }
  }

  try {
    return await task()
  } finally {
    rmSync(lockDir, { recursive: true, force: true })
  }
}

function lockMtimeMs(path) {
  return statSync(path).mtimeMs
}

function writeLockOwner(path) {
  writeFileSync(path, `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`)
}

function lockOwnerIsDead(path) {
  let owner
  try {
    owner = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return false
  }
  const pid = owner?.pid
  if (!Number.isInteger(pid) || pid <= 0) return true
  if (pid === process.pid) return false
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    return error?.code === 'ESRCH'
  }
}
