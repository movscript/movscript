#!/usr/bin/env node
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const scriptDir = fileURLToPath(new URL('.', import.meta.url))
const appDir = resolve(scriptDir, '..')
const repoDir = resolve(appDir, '../..')
const workspaceDir = resolve(process.env.MOVSCRIPT_HOME || process.env.MOVSCRIPT_WORKSPACE_DIR || resolve(repoDir, '.movscript-dev', '.movscript'))
const userDataDir = resolve(process.env.MOVSCRIPT_DESKTOP_USER_DATA_DIR || resolve(repoDir, '.movscript-dev', 'user-data'))

mkdirSync(workspaceDir, { recursive: true })
mkdirSync(userDataDir, { recursive: true })

const env = {
  ...process.env,
  MOVSCRIPT_HOME: workspaceDir,
  MOVSCRIPT_WORKSPACE_DIR: workspaceDir,
  MOVSCRIPT_DESKTOP_USER_DATA_DIR: userDataDir,
  MOVSCRIPT_BROWSER_DIAGNOSTICS: process.env.MOVSCRIPT_BROWSER_DIAGNOSTICS || '1',
  VITE_MOVSCRIPT_RENDER_DIAGNOSTICS: process.env.VITE_MOVSCRIPT_RENDER_DIAGNOSTICS || '1',
}

console.info(`[desktop] using debug workspace: ${workspaceDir}`)
console.info(`[desktop] using debug userData: ${userDataDir}`)

const child = spawn('electron-vite', ['dev'], {
  cwd: appDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  detached: process.platform !== 'win32',
  env,
})

let shuttingDown = false

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
