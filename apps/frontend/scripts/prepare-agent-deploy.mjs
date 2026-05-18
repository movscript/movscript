import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const pnpmEntrypoint = process.env.npm_execpath

function runPnpm(args) {
  if (pnpmEntrypoint && !/\.(cmd|bat|ps1)$/i.test(pnpmEntrypoint)) {
    return spawnSync(process.execPath, [pnpmEntrypoint, ...args], { stdio: 'inherit' })
  }

  return spawnSync(pnpmEntrypoint ?? 'pnpm', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}

if (isDirectRun(import.meta.url)) {
  prepareAgentDeploy(repoRoot)
}

export function prepareAgentDeploy(root = repoRoot, options = {}) {
  const sourceDir = resolve(root, 'apps/agent')
  const targetDir = resolve(root, 'apps/frontend/movscript-agent')
  const runBuild = options.runBuild ?? runPnpm

  if (!existsSync(sourceDir)) {
    throw new Error(`source directory not found: ${sourceDir}`)
  }

  const build = runBuild(['--dir', sourceDir, 'build'])

  if (build.error) {
    throw new Error(`failed to start agent bundle build from ${sourceDir}: ${build.error.message}`)
  }
  if (build.status !== 0) {
    const detail = build.signal
      ? `signal ${build.signal}`
      : typeof build.status === 'number'
        ? `exit code ${build.status}`
        : 'unknown exit status'
    throw new Error(`failed to build agent bundle from ${sourceDir}: ${detail}`)
  }

  rmSync(targetDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })

  for (const entry of ['dist', 'catalog']) {
    const from = resolve(sourceDir, entry)
    if (!existsSync(from)) continue
    const to = resolve(targetDir, entry)
    cpSync(from, to, { recursive: true, dereference: true })
  }

  const sourcePackage = JSON.parse(readFileSync(resolve(sourceDir, 'package.json'), 'utf8'))
  writeFileSync(
    resolve(targetDir, 'package.json'),
    `${JSON.stringify(createRuntimePackageJson(sourcePackage), null, 2)}\n`,
  )
}

export function createRuntimePackageJson(agentPackageJson) {
  const runtimePackageJson = {
    name: agentPackageJson.name,
    version: agentPackageJson.version,
    private: true,
    type: agentPackageJson.type ?? 'module',
    main: './dist/server.bundle.js',
  }

  const cliBin = agentPackageJson.bin?.['movscript-agent']
  if (typeof cliBin === 'string') {
    runtimePackageJson.bin = {
      'movscript-agent': cliBin,
    }
  }

  return runtimePackageJson
}

function isDirectRun(metaUrl) {
  return process.argv[1] && fileURLToPath(metaUrl) === resolve(process.argv[1])
}
