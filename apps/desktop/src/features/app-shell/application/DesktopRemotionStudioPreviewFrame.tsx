import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectRemotionStudioPreviewFrameProps } from '@movscript/project-surface/react'

import type { ElectronEmbeddedBrowserBounds, ElectronEmbeddedBrowserState } from '@/shared/contracts/electronApi'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { listenToWindowEvent } from '@/shared/infrastructure/windowEvents'

const REMOTION_STUDIO_BROWSER_TAB_PREFIX = 'remotion-studio'
const MIN_BROWSER_BOUND_SIZE = 16

export function DesktopRemotionStudioPreviewFrame({
  previewUrl,
  refreshNonce,
  className,
  title,
  onError,
  onLoad,
}: ProjectRemotionStudioPreviewFrameProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [browserState, setBrowserState] = useState<ElectronEmbeddedBrowserState | null>(null)
  const [fallbackToIframe, setFallbackToIframe] = useState(false)
  const tabId = useMemo(() => remotionStudioBrowserTabId(previewUrl), [previewUrl])

  const readBounds = useCallback(
    () => embeddedBrowserBoundsFromElement(viewportRef.current),
    [],
  )

  const syncBounds = useCallback(() => {
    const api = readElectronApi()
    if (!api?.embeddedBrowserActivate) return
    void api.embeddedBrowserActivate({ tabId, bounds: readBounds() })
  }, [readBounds, tabId])

  useEffect(() => {
    const api = readElectronApi()
    if (!api?.embeddedBrowserNavigate) {
      setFallbackToIframe(true)
      return
    }

    setFallbackToIframe(false)
    setBrowserState((current) => current ? { ...current, loading: true, error: undefined } : current)
    void api.embeddedBrowserNavigate({
      tabId,
      url: previewUrl,
      bounds: readBounds(),
    }).then((next) => {
      setBrowserState(next)
      if (next.error) onError()
      else if (!next.loading && next.url) onLoad()
    }).catch((error) => {
      setBrowserState((current) => ({
        ...emptyDesktopRemotionBrowserState(tabId),
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      }))
      onError()
    })

    return () => {
      void readElectronApi()?.embeddedBrowserClose?.({ tabId })
    }
  }, [onError, onLoad, previewUrl, readBounds, refreshNonce, tabId])

  useEffect(() => {
    const api = readElectronApi()
    if (!api?.onEmbeddedBrowserState) return undefined
    return api.onEmbeddedBrowserState((next) => {
      if (next.tabId !== tabId) return
      setBrowserState(next)
      if (next.error) onError()
      else if (!next.loading && next.url) onLoad()
    })
  }, [onError, onLoad, tabId])

  useEffect(() => {
    if (fallbackToIframe) return undefined
    syncBounds()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncBounds)
    if (viewportRef.current) observer?.observe(viewportRef.current)
    const cleanupResize = listenToWindowEvent('resize', syncBounds)
    const cleanupScroll = listenToWindowEvent('scroll', syncBounds, true)

    return () => {
      observer?.disconnect()
      cleanupResize()
      cleanupScroll()
    }
  }, [fallbackToIframe, syncBounds])

  if (fallbackToIframe) {
    return (
      <iframe
        key={`${previewUrl}:${refreshNonce}:desktop-fallback`}
        className={className}
        src={previewUrl}
        title={title}
        allow="clipboard-read; clipboard-write; fullscreen"
        onError={onError}
        onLoad={onLoad}
      />
    )
  }

  return (
    <div
      ref={viewportRef}
      className={className}
      aria-label={title}
      data-loading={browserState?.loading ? 'true' : 'false'}
      data-error={browserState?.error ? 'true' : 'false'}
    />
  )
}

function remotionStudioBrowserTabId(previewUrl: string): string {
  try {
    const url = new URL(previewUrl)
    return `${REMOTION_STUDIO_BROWSER_TAB_PREFIX}:${url.origin}`
  } catch {
    return `${REMOTION_STUDIO_BROWSER_TAB_PREFIX}:default`
  }
}

function embeddedBrowserBoundsFromElement(
  element: Pick<HTMLElement, 'getBoundingClientRect'> | null | undefined,
): ElectronEmbeddedBrowserBounds | null {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  const bounds = {
    x: Math.round(Number(rect.left)),
    y: Math.round(Number(rect.top)),
    width: Math.round(Number(rect.width)),
    height: Math.round(Number(rect.height)),
  }
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return null
  if (bounds.width < MIN_BROWSER_BOUND_SIZE || bounds.height < MIN_BROWSER_BOUND_SIZE) return null
  return bounds
}

function emptyDesktopRemotionBrowserState(tabId: string): ElectronEmbeddedBrowserState {
  return {
    tabId,
    visible: false,
    url: '',
    title: '',
    loading: false,
    canGoBack: false,
    canGoForward: false,
  }
}
