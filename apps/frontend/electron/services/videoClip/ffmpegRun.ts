import { spawn } from 'child_process'
import type { Readable } from 'stream'
import {
  FFMPEG_STDERR_LIMIT,
  FFMPEG_TIMEOUT_MS,
} from './constants'

type FFmpegProcess = {
  stderr?: Readable
  kill: (signal?: NodeJS.Signals | number) => boolean
  on: (event: 'error' | 'exit', listener: (value: Error | number | null) => void) => FFmpegProcess
}
type FFmpegSpawn = (command: string, args: string[], options: { stdio: ['ignore', 'ignore', 'pipe'] }) => FFmpegProcess

export class FFmpegTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`ffmpeg timed out after ${Math.round(timeoutMs / 1000)}s`)
    this.name = 'FFmpegTimeoutError'
  }
}

export function runFFmpeg(
  ffmpeg: string,
  args: string[],
  options: {
    timeoutMs?: number
    stderrLimit?: number
    spawnProcess?: FFmpegSpawn
  } = {},
): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const timeoutMs = options.timeoutMs ?? FFMPEG_TIMEOUT_MS
    const stderrLimit = options.stderrLimit ?? FFMPEG_STDERR_LIMIT
    const spawnProcess: FFmpegSpawn = options.spawnProcess ?? spawn
    const child = spawnProcess(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    let settled = false
    const timeout = timeoutMs > 0
      ? setTimeout(() => {
        if (settled) return
        settled = true
        child.kill('SIGKILL')
        reject(new FFmpegTimeoutError(timeoutMs))
      }, timeoutMs)
      : undefined
    const settle = (handler: () => void) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      handler()
    }
    child.stderr?.on('data', (chunk) => {
      stderr = appendLimited(stderr, String(chunk), stderrLimit)
    })
    child.on('error', (error) => settle(() => reject(error instanceof Error ? error : new Error(String(error)))))
    child.on('exit', (code) => {
      settle(() => {
        if (code === 0) {
          resolveRun()
          return
        }
        reject(new Error(stderr.trim() || `ffmpeg exited with code ${code ?? 'unknown'}`))
      })
    })
  })
}

function appendLimited(current: string, chunk: string, limit: number): string {
  if (limit <= 0) return ''
  const next = current + chunk
  return next.length <= limit ? next : next.slice(next.length - limit)
}
