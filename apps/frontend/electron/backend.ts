import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'

let proc: ChildProcess | null = null

export async function startBackend(): Promise<void> {
  // In dev, assume the Go server is started manually.
  // In production, launch the bundled binary.
  if (process.env.NODE_ENV === 'development') return

  const bin = join(app.getAppPath(), '..', 'backend', 'server')
  proc = spawn(bin, [], {
    env: { ...process.env },
    stdio: 'inherit'
  })

  proc.on('error', (err) => console.error('[backend]', err))

  // Give the server a moment to start
  await new Promise((r) => setTimeout(r, 500))
}

export async function stopBackend(): Promise<void> {
  if (proc) {
    proc.kill()
    proc = null
  }
}
