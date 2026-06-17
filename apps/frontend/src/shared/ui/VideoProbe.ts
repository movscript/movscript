export type VideoProbeMetadata = {
  durationSec?: number
  width?: number
  height?: number
}

export type MediaProbeMetadata = {
  durationMs?: number
  width?: number
  height?: number
}

export async function loadTimedMediaProbeMetadataFromUrl(
  sourceUrl: string,
  assetType: 'audio' | 'video',
  timeoutMs: number,
): Promise<MediaProbeMetadata> {
  const media = document.createElement(assetType === 'audio' ? 'audio' : 'video')
  media.preload = 'metadata'
  media.src = sourceUrl
  try {
    return await waitForTimedMediaProbeMetadata(media, timeoutMs)
  } finally {
    media.removeAttribute('src')
    media.load()
  }
}

export async function loadImageProbeMetadataFromUrl(
  sourceUrl: string,
  timeoutMs: number,
): Promise<MediaProbeMetadata> {
  const image = document.createElement('img')
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeout)
      image.onload = null
      image.onerror = null
    }
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('Image metadata probe timed out.'))
    }, timeoutMs)
    image.onload = () => {
      cleanup()
      resolve({ width: image.naturalWidth || undefined, height: image.naturalHeight || undefined })
    }
    image.onerror = () => {
      cleanup()
      reject(new Error('Image metadata probe failed.'))
    }
    image.src = sourceUrl
  })
}

export async function loadVideoProbeMetadataFromObjectUrl(
  url: string,
  cleanup: () => void,
  timeoutMs: number,
): Promise<VideoProbeMetadata> {
  return new Promise(resolve => {
    const video = document.createElement('video')
    let settled = false
    const done = (metadata: VideoProbeMetadata) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      cleanup()
      resolve(metadata)
    }
    const timeout = window.setTimeout(() => done({}), timeoutMs)
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.onloadedmetadata = () => {
      done({
        durationSec: Number.isFinite(video.duration) ? video.duration : undefined,
        width: video.videoWidth || undefined,
        height: video.videoHeight || undefined,
      })
    }
    video.onerror = () => done({})
    video.src = url
  })
}

export async function captureVideoThumbnails(
  sourceUrl: string,
  targetSeconds: number[],
  {
    width,
    metadataTimeoutMs,
    seekTimeoutMs,
    quality = 0.76,
  }: {
    width: number
    metadataTimeoutMs: number
    seekTimeoutMs: number
    quality?: number
  },
): Promise<Array<string | undefined>> {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'metadata'
  video.src = sourceUrl
  try {
    await waitForVideoProbeMetadata(video, metadataTimeoutMs)
    const result: Array<string | undefined> = []
    for (const targetSec of targetSeconds) {
      result.push(await captureVideoThumbnail(video, targetSec, width, seekTimeoutMs, quality))
    }
    return result
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}

function waitForTimedMediaProbeMetadata(media: HTMLMediaElement, timeoutMs: number): Promise<MediaProbeMetadata> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeout)
      media.onloadedmetadata = null
      media.onerror = null
    }
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('Media metadata probe timed out.'))
    }, timeoutMs)
    media.onloadedmetadata = () => {
      cleanup()
      resolve({
        durationMs: Number.isFinite(media.duration) && media.duration > 0 ? Math.round(media.duration * 1000) : undefined,
        ...(media instanceof HTMLVideoElement && media.videoWidth > 0 ? { width: media.videoWidth } : {}),
        ...(media instanceof HTMLVideoElement && media.videoHeight > 0 ? { height: media.videoHeight } : {}),
      })
    }
    media.onerror = () => {
      cleanup()
      reject(new Error('Media metadata probe failed.'))
    }
  })
}

function waitForVideoProbeMetadata(video: HTMLVideoElement, timeoutMs: number): Promise<void> {
  if (video.readyState >= 1) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeout)
      video.onloadedmetadata = null
      video.onerror = null
    }
    const timeout = window.setTimeout(() => {
      cleanup()
      resolve()
    }, timeoutMs)
    video.onloadedmetadata = () => {
      cleanup()
      resolve()
    }
    video.onerror = () => {
      cleanup()
      reject(new Error('video metadata unavailable'))
    }
  })
}

function captureVideoThumbnail(
  video: HTMLVideoElement,
  startSec: number,
  width: number,
  timeoutMs: number,
  quality: number,
): Promise<string | undefined> {
  return new Promise(resolve => {
    const duration = Number.isFinite(video.duration) ? video.duration : undefined
    const target = duration === undefined ? startSec : Math.min(startSec + 0.05, Math.max(0, duration - 0.05))
    const cleanup = () => {
      window.clearTimeout(timeout)
      video.onseeked = null
      video.onerror = null
    }
    const draw = () => {
      cleanup()
      resolve(drawVideoThumbnail(video, width, quality))
    }
    const timeout = window.setTimeout(() => {
      cleanup()
      resolve(undefined)
    }, timeoutMs)
    video.onseeked = draw
    video.onerror = () => {
      cleanup()
      resolve(undefined)
    }
    if (Math.abs(video.currentTime - target) <= 0.04 && video.readyState >= 2) {
      draw()
      return
    }
    video.currentTime = target
  })
}

function drawVideoThumbnail(video: HTMLVideoElement, width: number, quality: number): string | undefined {
  if (!video.videoWidth || !video.videoHeight) return undefined
  const height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return undefined
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight)
  const drawWidth = video.videoWidth * scale
  const drawHeight = video.videoHeight * scale
  context.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
  return canvas.toDataURL('image/jpeg', quality)
}
