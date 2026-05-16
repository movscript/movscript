export const desktopPlatforms = Object.freeze(['darwin', 'linux', 'win32'])
export const desktopArchs = Object.freeze(['x64', 'arm64'])
export const desktopReleaseTargets = Object.freeze([
  Object.freeze({ platform: 'darwin', arch: 'x64' }),
  Object.freeze({ platform: 'darwin', arch: 'arm64' }),
  Object.freeze({ platform: 'linux', arch: 'x64' }),
  Object.freeze({ platform: 'linux', arch: 'arm64' }),
  Object.freeze({ platform: 'win32', arch: 'x64' }),
])

export function assertDesktopPlatform(platform, label = 'desktop target') {
  if (!desktopPlatforms.includes(platform)) {
    throw new Error(`Unsupported ${label} platform: ${platform}`)
  }
}

export function assertDesktopArch(arch, label = 'desktop target') {
  if (!desktopArchs.includes(arch)) {
    throw new Error(`Unsupported ${label} arch: ${arch}`)
  }
}

export function desktopFFmpegBinaryName(platform) {
  return platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
}

export function isDesktopReleaseTarget(platform, arch) {
  return desktopReleaseTargets.some((target) => target.platform === platform && target.arch === arch)
}
