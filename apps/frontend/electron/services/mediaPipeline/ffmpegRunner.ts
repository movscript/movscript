import { spawn } from 'child_process'
import type { Readable } from 'stream'

export interface MediaPipelineProcessOutput {
  stream: 'stdout' | 'stderr'
  chunk: string
}

type FFmpegProcess = {
  stdout?: Readable
  stderr?: Readable
  kill: (signal?: NodeJS.Signals | number) => boolean
  on: (event: 'error' | 'exit', listener: (value: Error | number | null) => void) => FFmpegProcess
}
type FFmpegSpawn = (command: string, args: string[], options: { stdio: ['ignore', 'pipe', 'pipe'] }) => FFmpegProcess

export const MEDIA_PIPELINE_FFMPEG_TIMEOUT_MS = 20 * 60 * 1000
export const MEDIA_PIPELINE_FFMPEG_STDERR_LIMIT = 64 * 1024

export class MediaPipelineFFmpegTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`ffmpeg timed out after ${Math.round(timeoutMs / 1000)}s`)
    this.name = 'FFmpegTimeoutError'
  }
}

export class MediaPipelineFFmpegCanceledError extends Error {
  constructor() {
    super('ffmpeg was canceled')
    this.name = 'FFmpegCanceledError'
  }
}

export function runMediaPipelineFFmpeg(
  ffmpegPath: string,
  args: string[],
  options: {
    timeoutMs?: number
    stderrLimit?: number
    spawnProcess?: FFmpegSpawn
    signal?: AbortSignal
    onOutput?: (output: MediaPipelineProcessOutput) => void
  } = {},
): Promise<void> {
  return new Promise((resolveRun, reject) => {
    if (options.signal?.aborted) {
      reject(new MediaPipelineFFmpegCanceledError())
      return
    }
    const timeoutMs = options.timeoutMs ?? MEDIA_PIPELINE_FFMPEG_TIMEOUT_MS
    const stderrLimit = options.stderrLimit ?? MEDIA_PIPELINE_FFMPEG_STDERR_LIMIT
    const spawnProcess: FFmpegSpawn = options.spawnProcess ?? spawn
    const child = spawnProcess(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    let settled = false
    const timeout = timeoutMs > 0
      ? setTimeout(() => {
        if (settled) return
        settled = true
        child.kill('SIGKILL')
        reject(new MediaPipelineFFmpegTimeoutError(timeoutMs))
      }, timeoutMs)
      : undefined
    const settle = (handler: () => void) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      options.signal?.removeEventListener('abort', abort)
      handler()
    }
    const abort = () => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      child.kill('SIGTERM')
      reject(new MediaPipelineFFmpegCanceledError())
    }
    options.signal?.addEventListener('abort', abort, { once: true })
    child.stdout?.on('data', (chunk) => {
      emitOutput(options.onOutput, { stream: 'stdout', chunk: String(chunk) })
    })
    child.stderr?.on('data', (chunk) => {
      const text = String(chunk)
      stderr = appendLimited(stderr, text, stderrLimit)
      emitOutput(options.onOutput, { stream: 'stderr', chunk: text })
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

function emitOutput(
  onOutput: ((output: MediaPipelineProcessOutput) => void) | undefined,
  output: MediaPipelineProcessOutput,
): void {
  try {
    onOutput?.(output)
  } catch {
    // FFmpeg execution should not fail because diagnostic log delivery failed.
  }
}

function appendLimited(current: string, chunk: string, limit: number): string {
  if (limit <= 0) return ''
  const next = current + chunk
  return next.length <= limit ? next : next.slice(next.length - limit)
}
