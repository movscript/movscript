import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

export type FFmpegPathOptions = {
  platform?: NodeJS.Platform
  arch?: string
  resourcesPath?: string
  cwd?: string
}

export function getExpectedBundledFFmpegPath(options: FFmpegPathOptions = {}): string {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const binary = ffmpegBinaryName(platform)
  const resourcesPath = options.resourcesPath ?? process.resourcesPath
  if (resourcesPath) return join(resourcesPath, 'ffmpeg', platform, arch, binary)
  return resolve(options.cwd ?? process.cwd(), 'vendor/ffmpeg', platform, arch, binary)
}

export function ffmpegBinaryName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
}

export function resolveFFmpegPath(options: FFmpegPathOptions = {}): string | undefined {
  const envPath = process.env.FFMPEG_PATH?.trim() || process.env.MOVSCRIPT_FFMPEG_PATH?.trim()
  if (envPath && existsSync(envPath)) return envPath

  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const resourcesPath = options.resourcesPath ?? process.resourcesPath
  const cwd = options.cwd ?? process.cwd()
  const binary = ffmpegBinaryName(platform)
  const candidates = [
    join(resourcesPath || '', 'ffmpeg', platform, arch, binary),
    join(resourcesPath || '', 'ffmpeg', platform, binary),
    join(resourcesPath || '', 'ffmpeg', binary),
    join(resourcesPath || '', 'bin', binary),
    resolve(cwd, 'vendor/ffmpeg', platform, arch, binary),
    resolve(cwd, 'vendor/ffmpeg', platform, binary),
    resolve(cwd, '../../apps/desktop/vendor/ffmpeg', platform, arch, binary),
    resolve(cwd, '../../apps/desktop/vendor/ffmpeg', platform, binary),
    binary,
  ]
  return candidates.find((candidate) => candidate === binary || existsSync(candidate))
}
