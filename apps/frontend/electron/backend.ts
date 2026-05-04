import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'

let proc: ChildProcess | null = null

export async function startBackend(): Promise<void> {
  // In dev, assume the Go server is started manually.
  // Desktop releases use the configured cloud API by default. A bundled local
  // backend is opt-in for internal builds.
  if (process.env.NODE_ENV === 'development') return
  if (process.env.MOVSCRIPT_ENABLE_BUNDLED_BACKEND !== '1') return

  const binary = process.platform === 'win32' ? 'server.exe' : 'server'
  const bin = join(app.getAppPath(), '..', 'backend', binary)
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
