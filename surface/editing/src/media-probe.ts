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
