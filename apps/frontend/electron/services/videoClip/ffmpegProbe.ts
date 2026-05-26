import { spawn } from 'child_process'
import type { Readable } from 'stream'
import { FFMPEG_STATUS_TIMEOUT_MS } from './constants'
import { FFmpegTimeoutError } from './ffmpegRun'

type FFmpegProcess = {
  stderr?: Readable
  kill: (signal?: NodeJS.Signals | number) => boolean
  on: (event: 'error' | 'exit', listener: (value: Error | number | null) => void) => FFmpegProcess
}
type FFmpegVersionProcess = FFmpegProcess & { stdout?: Readable }
type FFmpegVersionSpawn = (
  command: string,
  args: string[],
  options: { stdio: ['ignore', 'pipe', 'pipe'] },
) => FFmpegVersionProcess

export function readFFmpegVersion(
  ffmpeg: string,
  options: {
    timeoutMs?: number
    spawnProcess?: FFmpegVersionSpawn
  } = {},
): Promise<string> {
  return new Promise((resolveRun, reject) => {
    const timeoutMs = options.timeoutMs ?? FFMPEG_STATUS_TIMEOUT_MS
    const spawnProcess: FFmpegVersionSpawn = options.spawnProcess ?? spawn
    const child = spawnProcess(ffmpeg, ['-version'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
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
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => settle(() => reject(error instanceof Error ? error : new Error(String(error)))))
    child.on('exit', (code) => {
      settle(() => {
        if (code === 0) {
          resolveRun(stdout.split(/\r?\n/)[0]?.trim() || 'ffmpeg')
          return
        }
        reject(new Error(stderr.trim() || `ffmpeg -version exited with code ${code ?? 'unknown'}`))
      })
    })
  })
}

export function readFFmpegFilters(
  ffmpeg: string,
  options: {
    timeoutMs?: number
    spawnProcess?: FFmpegVersionSpawn
  } = {},
): Promise<Set<string>> {
  return new Promise((resolveRun, reject) => {
    const timeoutMs = options.timeoutMs ?? FFMPEG_STATUS_TIMEOUT_MS
    const spawnProcess: FFmpegVersionSpawn = options.spawnProcess ?? spawn
    const child = spawnProcess(ffmpeg, ['-hide_banner', '-filters'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
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
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => settle(() => reject(error instanceof Error ? error : new Error(String(error)))))
    child.on('exit', (code) => {
      settle(() => {
        if (code === 0) {
          resolveRun(parseFFmpegFilters(stdout))
          return
        }
        reject(new Error(stderr.trim() || `ffmpeg -filters exited with code ${code ?? 'unknown'}`))
      })
    })
  })
}

export function parseFFmpegFilters(output: string): Set<string> {
  const filters = new Set<string>()
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*[T.][S.][C.]\s+([^\s]+)\s/)
    if (match?.[1]) filters.add(match[1])
  }
  return filters
}
