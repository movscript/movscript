import { useEffect, useState } from 'react'
import type { RawResource } from '@movscript/shared'
import { clipSourceError, type ClipSourceError } from '../domain/videoClipUi'
import { createObjectUrl, revokeObjectUrl } from '@movscript/shared/browser'
import { loadResourceBlob } from '../../resourceMediaBrowser.js'

export type ResourceVideoClipSourceError = ClipSourceError | 'load_failed'

export interface ResourceVideoClipSourceState {
  sourceBlob: Blob | null
  sourceUrl: string
  loadingSource: boolean
  sourceProgress: { loaded: number; total?: number }
  sourceError: ResourceVideoClipSourceError | ''
  sourceErrorSize?: number
  sourceErrorRetryable: boolean
  retrySourceLoad: () => void
}

export function useResourceVideoClipSource(resource: RawResource): ResourceVideoClipSourceState {
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [loadingSource, setLoadingSource] = useState(true)
  const [sourceProgress, setSourceProgress] = useState<{ loaded: number; total?: number }>({ loaded: 0 })
  const [sourceLoadAttempt, setSourceLoadAttempt] = useState(0)
  const [sourceError, setSourceError] = useState<ResourceVideoClipSourceError | ''>('')
  const [sourceErrorSize, setSourceErrorSize] = useState<number | undefined>()
  const [sourceErrorRetryable, setSourceErrorRetryable] = useState(false)

  useEffect(() => {
    let active = true
    let objectUrl = ''
    const controller = new AbortController()
    setLoadingSource(true)
    setSourceError('')
    setSourceErrorSize(undefined)
    setSourceErrorRetryable(false)
    setSourceProgress({ loaded: 0, total: resource.size || undefined })

    const initialSourceError = clipSourceError(resource.size)
    if (initialSourceError) {
      setSourceError(initialSourceError)
      setSourceErrorSize(resource.size)
      setSourceErrorRetryable(false)
      setLoadingSource(false)
      setSourceBlob(null)
      setSourceUrl('')
      return () => {
        active = false
      }
    }

    loadResourceBlob(resource, {
      signal: controller.signal,
      onDownloadProgress: (event) => {
        if (!active) return
        setSourceProgress({
          loaded: event.loaded,
          total: event.total || resource.size || undefined,
        })
      },
    })
      .then((blob) => {
        if (!active) return
        const downloadedSourceError = clipSourceError(blob.size)
        if (downloadedSourceError) {
          setSourceError(downloadedSourceError)
          setSourceErrorSize(blob.size)
          setSourceErrorRetryable(false)
          return
        }
        objectUrl = createObjectUrl(blob)
        setSourceBlob(blob)
        setSourceUrl(objectUrl)
      })
      .catch(() => {
        if (active) {
          setSourceError('load_failed')
          setSourceErrorRetryable(true)
        }
      })
      .finally(() => {
        if (active) setLoadingSource(false)
      })

    return () => {
      active = false
      controller.abort()
      revokeObjectUrl(objectUrl)
    }
  }, [resource, sourceLoadAttempt])

  return {
    sourceBlob,
    sourceUrl,
    loadingSource,
    sourceProgress,
    sourceError,
    sourceErrorSize,
    sourceErrorRetryable,
    retrySourceLoad: () => setSourceLoadAttempt((attempt) => attempt + 1),
  }
}
