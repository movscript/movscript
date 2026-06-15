import { useEffect, useState } from 'react'
import type { ReactEventHandler, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { X, Maximize2, Download, FileAudio, FileText, File, PlayCircle } from 'lucide-react'
import { AuthedImage, AuthedVideo } from '@/shared/ui/AuthedImage'
import { ResourceAudio } from '@/shared/ui/ResourceAudio'
import { downloadResource } from '@/shared/ui/resourceDownload'
import { loadResourceTextUrl } from '@/shared/ui/resourceText'
import { resolveResourceUrl } from '@/shared/ui/resourceUrl'
import { resourceTextKeys } from '@/features/resources/application/resourceQueryKeys'
import type { RawResource } from '@/types'
import {
  ResourceMediaAudioPanel,
  ResourceMediaCodeBlock,
  ResourceMediaDialog,
  ResourceMediaFallbackPanel,
  ResourceMediaFillFrame,
  ResourceMediaHoverOverlay,
  ResourceMediaTextPreviewPanel,
  ResourceMediaTextThumb,
  ResourceMediaThumb
} from '@movscript/ui/business/resource'

interface MediaViewerProps {
  resource: RawResource
  className?: string
  fit?: 'cover' | 'contain'
  metadata?: ReactNode
  sidePanel?: ReactNode
  diagnosticLabel?: string
  lightweightVideoThumb?: boolean
  thumbnailMaxSize?: number
  /** If true, clicking opens a fullscreen lightbox. Default: true */
  lightbox?: boolean
  /** Controlled open state — when provided, the component acts as a pure lightbox (no thumbnail) */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onPrevious?: () => void
  onNext?: () => void
  onImageLoad?: ReactEventHandler<HTMLImageElement>
  onVideoLoadedMetadata?: ReactEventHandler<HTMLVideoElement>
}

/** Renders a thumbnail/preview of a resource; image or video.
 *  Pass `open` + `onOpenChange` to use as a controlled lightbox without a thumbnail. */
export function MediaViewer({ resource, className = '', fit = 'cover', metadata, sidePanel, diagnosticLabel, lightweightVideoThumb = false, thumbnailMaxSize, lightbox = true, open: controlledOpen, onOpenChange, onPrevious, onNext, onImageLoad, onVideoLoadedMetadata }: MediaViewerProps) {
  const { t } = useTranslation()
  const [internalOpen, setInternalOpen] = useState(false)
  const proxyUrl = resolveResourceUrl(resource)

  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled ? (v: boolean) => onOpenChange?.(v) : setInternalOpen

  useEffect(() => {
    if (!open || (!onPrevious && !onNext)) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (isEditableKeyboardTarget(event.target)) return
      if (event.key === 'ArrowLeft' && onPrevious) {
        event.preventDefault()
        onPrevious()
      } else if (event.key === 'ArrowRight' && onNext) {
        event.preventDefault()
        onNext()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onNext, onPrevious, open])

  const thumb = (
    <ResourceMediaThumb
      className={className}
      onClick={() => lightbox && setOpen(true)}
      interactive={lightbox}
      fit={fit}
    >
      {resource.type === 'video' ? (
        lightweightVideoThumb
          ? <VideoPlaceholderThumb name={resource.name} size={resource.size} />
          : <VideoThumb proxyUrl={proxyUrl} fit={fit} diagnosticLabel={diagnosticLabel ?? `resource:${resource.ID}:thumb`} onLoadedMetadata={onVideoLoadedMetadata} />
      ) : resource.type === 'audio' ? (
        <IconThumb icon={<FileAudio size={24} />} />
      ) : resource.type === 'text' ? (
        <TextThumb proxyUrl={proxyUrl} name={resource.name} />
      ) : resource.type === 'image' ? (
        <ImageThumb proxyUrl={proxyUrl} alt={resource.name} diagnosticLabel={diagnosticLabel ?? `resource:${resource.ID}:thumb`} thumbnailMaxSize={thumbnailMaxSize} onLoad={onImageLoad} />
      ) : (
        <IconThumb icon={<File size={24} />} />
      )}
      {lightbox && (
        <ResourceMediaHoverOverlay icon={<Maximize2 size={18} />} />
      )}
    </ResourceMediaThumb>
  )

  const lightboxDialog = (
    <ResourceMediaDialog
      open={open}
      onOpenChange={setOpen}
      name={resource.name}
      metadata={metadata}
      sidePanel={sidePanel}
      downloadLabel={t('shared.mediaViewer.download')}
      closeLabel={t('common.close')}
      downloadIcon={<Download size={16} />}
      closeIcon={<X size={18} />}
      onDownload={() => downloadResource(resource)}
    >
      {resource.type === 'video' ? (
        <AuthedVideo src={proxyUrl} controls autoPlay diagnosticLabel={diagnosticLabel ?? `resource:${resource.ID}:lightbox`} />
      ) : resource.type === 'audio' ? (
        <ResourceMediaAudioPanel icon={<FileAudio size={18} />} name={resource.name}>
          <ResourceAudio resource={resource} controls autoPlay />
        </ResourceMediaAudioPanel>
      ) : resource.type === 'text' ? (
        <TextPreview proxyUrl={proxyUrl} />
      ) : resource.type === 'image' ? (
        <AuthedImage src={proxyUrl} alt={resource.name} diagnosticLabel={diagnosticLabel ?? `resource:${resource.ID}:lightbox`} />
      ) : (
        <ResourceMediaFallbackPanel icon={<File size={24} />} name={resource.name} />
      )}
    </ResourceMediaDialog>
  )

  // Controlled mode: just render the lightbox dialog, no thumbnail
  if (isControlled) return lightboxDialog

  if (!lightbox) return thumb

  return (
    <>
      {thumb}
      {lightboxDialog}
    </>
  )
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

function ImageThumb({ proxyUrl, alt, diagnosticLabel, thumbnailMaxSize, onLoad }: { proxyUrl: string; alt: string; diagnosticLabel?: string; thumbnailMaxSize?: number; onLoad?: ReactEventHandler<HTMLImageElement> }) {
  return <AuthedImage src={proxyUrl} alt={alt} diagnosticLabel={diagnosticLabel} thumbnailMaxSize={thumbnailMaxSize} onLoad={onLoad} />
}

function VideoThumb({ proxyUrl, fit, diagnosticLabel, onLoadedMetadata }: { proxyUrl: string; fit: 'cover' | 'contain'; diagnosticLabel?: string; onLoadedMetadata?: ReactEventHandler<HTMLVideoElement> }) {
  return (
    <ResourceMediaFillFrame fit={fit}>
      <AuthedVideo src={proxyUrl} muted playsInline preload="metadata" diagnosticLabel={diagnosticLabel} onLoadedMetadata={onLoadedMetadata} />
    </ResourceMediaFillFrame>
  )
}

function VideoPlaceholderThumb({ name, size }: { name: string; size?: number }) {
  return (
    <ResourceMediaFillFrame>
      <div className="resource-media-video-placeholder">
        <PlayCircle size={24} />
        <span>{name}</span>
        {size ? <small>{formatVideoPlaceholderBytes(size)}</small> : null}
      </div>
    </ResourceMediaFillFrame>
  )
}

function formatVideoPlaceholderBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function IconThumb({ icon }: { icon: ReactNode }) {
  return (
    <ResourceMediaFillFrame>
      {icon}
    </ResourceMediaFillFrame>
  )
}

function TextThumb({ proxyUrl, name }: { proxyUrl: string; name: string }) {
  const { data } = useQuery({
    queryKey: resourceTextKeys.thumb(proxyUrl),
    queryFn: () => loadResourceTextUrl(proxyUrl),
    staleTime: 5 * 60 * 1000,
  })
  const preview = data?.trim()

  return (
    <ResourceMediaTextThumb icon={<FileText size={12} />} name={name}>
      <ResourceMediaCodeBlock variant="thumb">
        {preview || name}
      </ResourceMediaCodeBlock>
    </ResourceMediaTextThumb>
  )
}

function TextPreview({ proxyUrl }: { proxyUrl: string }) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: resourceTextKeys.preview(proxyUrl),
    queryFn: () => loadResourceTextUrl(proxyUrl),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <ResourceMediaTextPreviewPanel loading={isLoading} loadingContent={t('common.loadingShort')}>
      <ResourceMediaCodeBlock>{data}</ResourceMediaCodeBlock>
    </ResourceMediaTextPreviewPanel>
  )
}
