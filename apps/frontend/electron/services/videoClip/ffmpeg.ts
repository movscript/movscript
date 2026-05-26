import type { VideoClipStatus } from './types'
import {
  ffmpegBinaryName,
  getExpectedBundledFFmpegPath,
  resolveFFmpegPath,
  type FFmpegPathOptions,
} from './ffmpegPath'
import { readFFmpegVersion } from './ffmpegProbe'

type VideoClipStatusOptions = FFmpegPathOptions & {
  resolvePath?: () => string | undefined
  readVersion?: (ffmpeg: string) => Promise<string>
}

export async function getVideoClipStatus(options: VideoClipStatusOptions = {}): Promise<VideoClipStatus> {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const expectedBundledPath = getExpectedBundledFFmpegPath(options)
  const ffmpeg = options.resolvePath ? options.resolvePath() : resolveFFmpegPath(options)
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
    const readVersion = options.readVersion ?? readFFmpegVersion
    const version = await readVersion(ffmpeg)
    return { available: true, path: ffmpeg, version, expectedBundledPath, platform, arch }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to run ffmpeg.'
    const missingCommand = ffmpeg === ffmpegBinaryName(platform) && /\bENOENT\b/i.test(message)
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

export {
  ffmpegBinaryName,
  getExpectedBundledFFmpegPath,
  resolveFFmpegPath,
  type FFmpegPathOptions,
} from './ffmpegPath'
export {
  parseFFmpegFilters,
  readFFmpegFilters,
  readFFmpegVersion,
} from './ffmpegProbe'
export {
  FFmpegTimeoutError,
  runFFmpeg,
} from './ffmpegRun'
