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

const child = spawn(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    ...envAssignments,
  },
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
