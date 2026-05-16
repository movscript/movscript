import { assertDesktopArch, assertDesktopPlatform, desktopFFmpegBinaryName, isDesktopReleaseTarget } from './desktop-targets.mjs'

export const ffmpegStaticReleaseTag = 'b6.1.1'
export const ffmpegStaticLicense = 'GPL-3.0-or-later'
export const ffmpegStaticBaseUrl = 'https://github.com/eugeneware/ffmpeg-static/releases/download'
export const ffmpegStaticDefaultVersion = 'ffmpeg version 6.1.1-static'

export function assertFFmpegStaticTarget(platform, arch) {
  assertDesktopPlatform(platform, 'ffmpeg-static')
  assertDesktopArch(arch, 'ffmpeg-static')
  if (!isDesktopReleaseTarget(platform, arch)) {
    throw new Error(`ffmpeg-static does not provide a default MovScript binary for ${platform} ${arch}`)
  }
}

export function ffmpegStaticAssetName(platform, arch) {
  assertFFmpegStaticTarget(platform, arch)
  return `ffmpeg-${platform}-${arch}.gz`
}

export function ffmpegStaticBinaryUrl(platform, arch, tag = ffmpegStaticReleaseTag) {
  return `${ffmpegStaticBaseUrl}/${tag}/${ffmpegStaticAssetName(platform, arch)}`
}

export function ffmpegStaticReadmeUrl(platform, arch, tag = ffmpegStaticReleaseTag) {
  assertFFmpegStaticTarget(platform, arch)
  return `${ffmpegStaticBaseUrl}/${tag}/${platform}-${arch}.README`
}

export function ffmpegStaticSourcePlan(platform, arch, tag = ffmpegStaticReleaseTag) {
  return {
    arch,
    binary: desktopFFmpegBinaryName(platform),
    license: ffmpegStaticLicense,
    platform,
    readmeUrl: ffmpegStaticReadmeUrl(platform, arch, tag),
    sourceUrl: ffmpegStaticBinaryUrl(platform, arch, tag),
    tag,
  }
}
