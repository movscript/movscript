#!/usr/bin/env node
import { spawn } from 'node:child_process'

const [, , ...rawArgs] = process.argv

const envAssignments = {}
let commandIndex = 0
while (commandIndex < rawArgs.length && rawArgs[commandIndex].includes('=')) {
  const [key, ...valueParts] = rawArgs[commandIndex].split('=')
  envAssignments[key] = valueParts.join('=')
  commandIndex += 1
}

const command = rawArgs[commandIndex]
const args = rawArgs.slice(commandIndex + 1)

if (Object.keys(envAssignments).length === 0 || !command) {
  console.error('usage: node scripts/run-with-env.mjs KEY=value [KEY=value ...] command [...args]')
  process.exit(1)
}

const isWindows = process.platform === 'win32'
const child = spawn(command, args, {
  stdio: 'inherit',
  shell: isWindows,
  detached: !isWindows,
  env: {
    ...process.env,
    ...envAssignments,
  },
})

let shuttingDown = false

function getSignalExitCode(signal) {
  if (signal === 'SIGINT') return 130
  if (signal === 'SIGTERM') return 143
  if (signal === 'SIGHUP') return 129
  return 1
}

function killChild(signal = 'SIGTERM') {
  if (!child.pid) return
  try {
    if (isWindows) {
      child.kill(signal)
      return
    }
    process.kill(-child.pid, signal)
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      console.error(error)
    }
  }
}

function handleSignal(signal) {
  if (shuttingDown) return
  shuttingDown = true
  killChild(signal)

  const timeout = setTimeout(() => {
    killChild('SIGKILL')
    process.exit(getSignalExitCode(signal))
  }, 5_000)
  timeout.unref()

  child.once('exit', () => {
    clearTimeout(timeout)
    process.exit(getSignalExitCode(signal))
  })
}

process.once('SIGINT', () => handleSignal('SIGINT'))
process.once('SIGTERM', () => handleSignal('SIGTERM'))
process.once('SIGHUP', () => handleSignal('SIGHUP'))

child.on('exit', (code, signal) => {
  if (shuttingDown) return
  if (signal) {
    process.exit(getSignalExitCode(signal))
    return
  }
  process.exit(code ?? 0)
})
