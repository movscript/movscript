#!/usr/bin/env node
import { spawn } from 'node:child_process'

const [, , assignment, command, ...args] = process.argv

if (!assignment || !assignment.includes('=') || !command) {
  console.error('usage: node scripts/run-with-env.mjs KEY=value command [...args]')
  process.exit(1)
}

const [key, ...valueParts] = assignment.split('=')
const child = spawn(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    [key]: valueParts.join('='),
  },
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
