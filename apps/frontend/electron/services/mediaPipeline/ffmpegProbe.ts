import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { spawn } from 'child_process'
import type { Readable } from 'stream'

import { MediaPipelineFFmpegTimeoutError } from './ffmpegRunner'

export interface MediaPipelineFFmpegStatus {
  available: boolean
  path?: string
  version?: string
  error?: string
  code?: 'FFMPEG_NOT_FOUND' | 'FFMPEG_UNAVAILABLE'
  expectedBundledPath?: string
  platform?: NodeJS.Platform
  arch?: string
}

export type MediaPipelineFFmpegPathOptions = {
  platform?: NodeJS.Platform
  arch?: string
  resourcesPath?: string
  cwd?: string
}

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

export const MEDIA_PIPELINE_FFMPEG_STATUS_TIMEOUT_MS = 5000

type MediaPipelineFFmpegStatusOptions = MediaPipelineFFmpegPathOptions & {
  resolvePath?: () => string | undefined
  readVersion?: (ffmpeg: string) => Promise<string>
}

export async function getMediaPipelineFFmpegStatus(
  options: MediaPipelineFFmpegStatusOptions = {},
): Promise<MediaPipelineFFmpegStatus> {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const expectedBundledPath = getExpectedMediaPipelineBundledFFmpegPath(options)
  const ffmpeg = options.resolvePath ? options.resolvePath() : resolveMediaPipelineFFmpegPath(options)
  if (!ffmpeg) {
    return {
      available: false,
      code: 'FFMPEG_NOT_FOUND',
      error: `ffmpeg is not available on this device. Expected bundled binary at ${expectedBundledPath}.`,
      expectedBundledPath,
      platform,
      arch,
    }
  }
  try {
    const readVersion = options.readVersion ?? readMediaPipelineFFmpegVersion
    const version = await readVersion(ffmpeg)
    return { available: true, path: ffmpeg, version, expectedBundledPath, platform, arch }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to run ffmpeg.'
    const missingCommand = ffmpeg === mediaPipelineFFmpegBinaryName(platform) && /\bENOENT\b/i.test(message)
    return {
      available: false,
      path: ffmpeg,
      code: missingCommand ? 'FFMPEG_NOT_FOUND' : 'FFMPEG_UNAVAILABLE',
      error: missingCommand
        ? `ffmpeg is not available on this device. Expected bundled binary at ${expectedBundledPath}.`
        : message,
      expectedBundledPath,
      platform,
      arch,
    }
  }
}

export function getExpectedMediaPipelineBundledFFmpegPath(options: MediaPipelineFFmpegPathOptions = {}): string {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const binary = mediaPipelineFFmpegBinaryName(platform)
  const resourcesPath = options.resourcesPath ?? process.resourcesPath
  if (resourcesPath) return join(resourcesPath, 'ffmpeg', platform, arch, binary)
  return resolve(options.cwd ?? process.cwd(), 'vendor/ffmpeg', platform, arch, binary)
}

export function mediaPipelineFFmpegBinaryName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
}

export function resolveMediaPipelineFFmpegPath(options: MediaPipelineFFmpegPathOptions = {}): string | undefined {
  const envPath = process.env.FFMPEG_PATH?.trim() || process.env.MOVSCRIPT_FFMPEG_PATH?.trim()
  if (envPath && existsSync(envPath)) return envPath

  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const resourcesPath = options.resourcesPath ?? process.resourcesPath
  const cwd = options.cwd ?? process.cwd()
  const binary = mediaPipelineFFmpegBinaryName(platform)
  const candidates = [
    join(resourcesPath || '', 'ffmpeg', platform, arch, binary),
    join(resourcesPath || '', 'ffmpeg', platform, binary),
    join(resourcesPath || '', 'ffmpeg', binary),
    join(resourcesPath || '', 'bin', binary),
    resolve(cwd, 'vendor/ffmpeg', platform, arch, binary),
    resolve(cwd, 'vendor/ffmpeg', platform, binary),
    resolve(cwd, '../../apps/frontend/vendor/ffmpeg', platform, arch, binary),
    resolve(cwd, '../../apps/frontend/vendor/ffmpeg', platform, binary),
    binary,
  ]
  return candidates.find((candidate) => candidate === binary || existsSync(candidate))
}

export function readMediaPipelineFFmpegVersion(
  ffmpeg: string,
  options: {
    timeoutMs?: number
    spawnProcess?: FFmpegVersionSpawn
  } = {},
): Promise<string> {
  return new Promise((resolveRun, reject) => {
    const timeoutMs = options.timeoutMs ?? MEDIA_PIPELINE_FFMPEG_STATUS_TIMEOUT_MS
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
        reject(new MediaPipelineFFmpegTimeoutError(timeoutMs))
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

export function readMediaPipelineFFmpegFilters(
  ffmpeg: string,
  options: {
    timeoutMs?: number
    spawnProcess?: FFmpegVersionSpawn
  } = {},
): Promise<Set<string>> {
  return new Promise((resolveRun, reject) => {
    const timeoutMs = options.timeoutMs ?? MEDIA_PIPELINE_FFMPEG_STATUS_TIMEOUT_MS
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
        reject(new MediaPipelineFFmpegTimeoutError(timeoutMs))
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
          resolveRun(parseMediaPipelineFFmpegFilters(stdout))
          return
        }
        reject(new Error(stderr.trim() || `ffmpeg -filters exited with code ${code ?? 'unknown'}`))
      })
    })
  })
}

export function parseMediaPipelineFFmpegFilters(output: string): Set<string> {
  const filters = new Set<string>()
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*[TSC.]{2,3}\s+([A-Za-z0-9_]+)\s+\S*->\S+/)
    if (match?.[1]) filters.add(match[1])
  }
  return filters
}
