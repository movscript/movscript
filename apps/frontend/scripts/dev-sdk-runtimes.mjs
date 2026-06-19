#!/usr/bin/env node
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'

const scriptDir = fileURLToPath(new URL('.', import.meta.url))
const appDir = resolve(scriptDir, '..')
const repoDir = resolve(appDir, '../..')
const workspaceDir = resolve(process.env.MOVSCRIPT_HOME || process.env.MOVSCRIPT_WORKSPACE_DIR || resolve(repoDir, '.movscript-dev', '.movscript'))
const runtimeDir = resolve(process.env.MOVSCRIPT_SDK_RUNTIME_DIR || resolve(repoDir, '.movscript-dev', 'sdk-runtimes'))
const localMovaSdkEntry = resolve(repoDir, '../mova/sdk/typescript/dist/index.js')
const movaSdkPackage = process.env.MOVSCRIPT_MOVA_SDK_PACKAGE || (existsSync(localMovaSdkEntry) ? localMovaSdkEntry : '')

const sdkRuntimeEnv = {
  MOVSCRIPT_HOME: workspaceDir,
  MOVSCRIPT_WORKSPACE_DIR: workspaceDir,
  MOVSCRIPT_SDK_RUNTIME_DIR: runtimeDir,
  MOVSCRIPT_CODEX_RUNTIME_API: process.env.MOVSCRIPT_CODEX_RUNTIME_API || 'codex-sdk',
  MOVSCRIPT_CODEX_SDK_PACKAGE: process.env.MOVSCRIPT_CODEX_SDK_PACKAGE || '@openai/codex-sdk',
  MOVSCRIPT_CODEX_SDK_PACKAGE_VERSION: process.env.MOVSCRIPT_CODEX_SDK_PACKAGE_VERSION || '0.141.0',
  MOVSCRIPT_MOVA_RUNTIME_API: process.env.MOVSCRIPT_MOVA_RUNTIME_API || 'mova-sdk',
  ...(movaSdkPackage ? { MOVSCRIPT_MOVA_SDK_PACKAGE: movaSdkPackage } : {}),
  ...(process.env.MOVSCRIPT_MOVA_SDK_PACKAGE_VERSION ? { MOVSCRIPT_MOVA_SDK_PACKAGE_VERSION: process.env.MOVSCRIPT_MOVA_SDK_PACKAGE_VERSION } : {}),
  MOVSCRIPT_CLAUDE_RUNTIME_API: process.env.MOVSCRIPT_CLAUDE_RUNTIME_API || 'claude-sdk',
  MOVSCRIPT_CLAUDE_SDK_PACKAGE: process.env.MOVSCRIPT_CLAUDE_SDK_PACKAGE || '@anthropic-ai/claude-agent-sdk',
  MOVSCRIPT_CLAUDE_SDK_PACKAGE_VERSION: process.env.MOVSCRIPT_CLAUDE_SDK_PACKAGE_VERSION || '0.3.181',
  MOVSCRIPT_DEFAULT_PROVIDER: process.env.MOVSCRIPT_DEFAULT_PROVIDER || 'codex',
  MOVSCRIPT_NEW_CONVERSATION_PROVIDER: process.env.MOVSCRIPT_NEW_CONVERSATION_PROVIDER || process.env.MOVSCRIPT_DEFAULT_PROVIDER || 'codex',
  MOVSCRIPT_BACKEND_READY_TIMEOUT_MS: process.env.MOVSCRIPT_BACKEND_READY_TIMEOUT_MS || '90000',
  MOVSCRIPT_BROWSER_DIAGNOSTICS: process.env.MOVSCRIPT_BROWSER_DIAGNOSTICS || '1',
  VITE_MOVSCRIPT_RENDER_DIAGNOSTICS: process.env.VITE_MOVSCRIPT_RENDER_DIAGNOSTICS || '1',
}

mkdirSync(workspaceDir, { recursive: true })
mkdirSync(runtimeDir, { recursive: true })

console.info(`[desktop] using debug workspace: ${workspaceDir}`)
console.info(`[desktop] using SDK runtime cache: ${runtimeDir}`)
console.info(`[desktop] Codex runtime: ${sdkRuntimeEnv.MOVSCRIPT_CODEX_RUNTIME_API} ${sdkRuntimeEnv.MOVSCRIPT_CODEX_SDK_PACKAGE}@${sdkRuntimeEnv.MOVSCRIPT_CODEX_SDK_PACKAGE_VERSION}`)
console.info(`[desktop] Mova runtime: ${sdkRuntimeEnv.MOVSCRIPT_MOVA_RUNTIME_API} ${sdkRuntimeEnv.MOVSCRIPT_MOVA_SDK_PACKAGE || 'not configured'}`)
console.info(`[desktop] Claude runtime: ${sdkRuntimeEnv.MOVSCRIPT_CLAUDE_RUNTIME_API} ${sdkRuntimeEnv.MOVSCRIPT_CLAUDE_SDK_PACKAGE}@${sdkRuntimeEnv.MOVSCRIPT_CLAUDE_SDK_PACKAGE_VERSION}`)
console.info(`[desktop] Default provider: ${sdkRuntimeEnv.MOVSCRIPT_DEFAULT_PROVIDER}`)

if (process.env.MOVSCRIPT_SDK_RUNTIME_PREPARE !== '0') {
  prepareSdkRuntimePackage(sdkRuntimeEnv.MOVSCRIPT_CODEX_SDK_PACKAGE, sdkRuntimeEnv.MOVSCRIPT_CODEX_SDK_PACKAGE_VERSION)
  if (sdkRuntimeEnv.MOVSCRIPT_MOVA_SDK_PACKAGE && !isLocalSdkRuntimeSpecifier(sdkRuntimeEnv.MOVSCRIPT_MOVA_SDK_PACKAGE)) {
    prepareSdkRuntimePackage(sdkRuntimeEnv.MOVSCRIPT_MOVA_SDK_PACKAGE, sdkRuntimeEnv.MOVSCRIPT_MOVA_SDK_PACKAGE_VERSION)
  }
  prepareSdkRuntimePackage(sdkRuntimeEnv.MOVSCRIPT_CLAUDE_SDK_PACKAGE, sdkRuntimeEnv.MOVSCRIPT_CLAUDE_SDK_PACKAGE_VERSION)
}

const child = spawn('electron-vite', ['dev'], {
  cwd: appDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  detached: process.platform !== 'win32',
  env: {
    ...process.env,
    ...sdkRuntimeEnv,
  },
})

let shuttingDown = false

function prepareSdkRuntimePackage(packageName, packageVersion) {
  const packageSpec = packageVersion ? `${packageName}@${packageVersion}` : packageName
  console.info(`[desktop] preparing SDK runtime package: ${packageSpec}`)
  const result = spawnSync('npm', ['install', '--prefix', runtimeDir, '--save-exact', packageSpec], {
    cwd: runtimeDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status === 0 && !result.error) return
  const error = result.error?.message || result.stderr?.trim() || result.stdout?.trim() || `exit status ${result.status ?? 'unknown'}`
  console.error(`[desktop] failed to prepare ${packageSpec}: ${error}`)
  process.exit(result.status ?? 1)
}

function isLocalSdkRuntimeSpecifier(specifier) {
  return specifier.startsWith('/') || specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('file://')
}

function exitCodeForSignal(signal) {
  if (signal === 'SIGINT') return 130
  if (signal === 'SIGTERM') return 143
  if (signal === 'SIGHUP') return 129
  return 1
}

function killChild(signal = 'SIGTERM') {
  if (!child.pid) return
  try {
    if (process.platform === 'win32') {
      child.kill(signal)
      return
    }
    process.kill(-child.pid, signal)
  } catch (error) {
    if (error?.code !== 'ESRCH') console.error(error)
  }
}

function handleSignal(signal) {
  if (shuttingDown) return
  shuttingDown = true
  killChild(signal)
  const timeout = setTimeout(() => {
    killChild('SIGKILL')
    process.exit(exitCodeForSignal(signal))
  }, 5_000)
  timeout.unref()
  child.once('exit', () => {
    clearTimeout(timeout)
    process.exit(exitCodeForSignal(signal))
  })
}

process.once('SIGINT', () => handleSignal('SIGINT'))
process.once('SIGTERM', () => handleSignal('SIGTERM'))
process.once('SIGHUP', () => handleSignal('SIGHUP'))

child.on('exit', (code, signal) => {
  if (shuttingDown) return
  if (signal) {
    process.exit(exitCodeForSignal(signal))
    return
  }
  process.exit(code ?? 0)
})
