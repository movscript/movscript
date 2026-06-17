import type { ElectronMediaPipelineClip } from '@/shared/contracts/electronApiMedia'

export async function extractTimelineVideoFrames(
  video: HTMLVideoElement,
  clip: ElectronMediaPipelineClip,
  frameCount: number,
  options: { width?: number; height?: number } = {},
) {
  if (typeof document === 'undefined' || frameCount <= 0 || video.readyState < 1) return []
  const durationSeconds = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
  const sourceStartSeconds = Math.max(0, (clip.sourceStartMs ?? 0) / 1000)
  const sourceEndSecondsFromClip = Math.max(sourceStartSeconds, (clip.sourceEndMs ?? (clip.sourceStartMs ?? 0) + clip.durationMs) / 1000)
  const sourceEndSeconds = durationSeconds > 0
    ? Math.min(durationSeconds, sourceEndSecondsFromClip)
    : sourceEndSecondsFromClip
  const captureDurationSeconds = Math.max(0.1, sourceEndSeconds - sourceStartSeconds)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(12, Math.min(320, Math.round(options.width ?? 160)))
  canvas.height = Math.max(32, Math.min(180, Math.round(options.height ?? 90)))
  const context = canvas.getContext('2d')
  if (!context) return []
  const frames: string[] = []
  const wasPaused = video.paused
  video.pause()

  try {
    for (let index = 0; index < frameCount; index += 1) {
      const ratio = (index + 0.5) / frameCount
      const timeSeconds = sourceStartSeconds + captureDurationSeconds * ratio
      await seekVideoTo(video, timeSeconds)
      await waitForVideoFrame(video)
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      frames.push(canvas.toDataURL('image/jpeg', 0.62))
    }
  } catch {
    return frames
  } finally {
    if (!wasPaused) video.play().catch(() => undefined)
  }
  return frames
}

function waitForVideoFrame(video: HTMLVideoElement) {
  return new Promise<void>((resolve) => {
    if ('requestVideoFrameCallback' in video && typeof video.requestVideoFrameCallback === 'function') {
      const timeout = window.setTimeout(resolve, 180)
      video.requestVideoFrameCallback(() => {
        window.clearTimeout(timeout)
        resolve()
      })
      return
    }
    window.requestAnimationFrame(() => resolve())
  })
}

export function seekVideoTo(video: HTMLVideoElement, seconds: number) {
  return new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      video.removeEventListener('seeked', finish)
      window.clearTimeout(timeout)
      resolve()
    }
    const timeout = window.setTimeout(finish, 450)
    video.addEventListener('seeked', finish, { once: true })
    try {
      video.currentTime = Math.max(0, seconds)
    } catch {
      finish()
    }
  })
}

export function seekPreviewVideo(video: HTMLVideoElement | null, seconds: number) {
  if (!video || !Number.isFinite(seconds) || video.readyState < 1) return
  try {
    video.pause()
    if (Math.abs(video.currentTime - seconds) > 0.08) video.currentTime = seconds
  } catch {
    // Some codecs reject seeking before enough metadata is available.
  }
}

export function seekVideoThumbnail(video: HTMLVideoElement | null) {
  if (!video || video.readyState < 1) return
  const duration = Number.isFinite(video.duration) ? video.duration : 0
  const thumbnailSecond = duration > 0 ? Math.min(Math.max(duration * 0.05, 0.12), 2) : 0.12
  seekPreviewVideo(video, thumbnailSecond)
}
