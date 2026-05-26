import { useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { X, Maximize2, Download, FileAudio, FileText, File } from 'lucide-react'
import { AuthedAudio, AuthedImage, AuthedVideo } from '@/shared/ui/AuthedImage'
import { api } from '@/shared/infrastructure/api'
import { API_BASE_URL as API_BASE } from '@/shared/infrastructure/config'
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
} from '@movscript/ui'

interface MediaViewerProps {
  resource: RawResource
  className?: string
  fit?: 'cover' | 'contain'
  metadata?: ReactNode
  sidePanel?: ReactNode
  /** If true, clicking opens a fullscreen lightbox. Default: true */
  lightbox?: boolean
  /** Controlled open state — when provided, the component acts as a pure lightbox (no thumbnail) */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function resolveResourceUrl(resource: RawResource): string {
  return resource.direct_url ?? `${API_BASE}${resource.url}`
}

export async function downloadResource(proxyUrl: string, name: string) {
  const res = await api.get(proxyUrl, { baseURL: '', responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function loadTextResource(proxyUrl: string): Promise<string> {
  const res = await api.get<string>(proxyUrl, {
    baseURL: '',
    responseType: 'text',
    transformResponse: [(data) => data],
  })
  return typeof res.data === 'string' ? res.data : String(res.data ?? '')
}

/** Renders a thumbnail/preview of a resource; image or video.
 *  Pass `open` + `onOpenChange` to use as a controlled lightbox without a thumbnail. */
export function MediaViewer({ resource, className = '', fit = 'cover', metadata, sidePanel, lightbox = true, open: controlledOpen, onOpenChange }: MediaViewerProps) {
  const { t } = useTranslation()
  const [internalOpen, setInternalOpen] = useState(false)
  const proxyUrl = resolveResourceUrl(resource)

  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled ? (v: boolean) => onOpenChange?.(v) : setInternalOpen

  const thumb = (
    <ResourceMediaThumb
      className={className}
      onClick={() => lightbox && setOpen(true)}
      interactive={lightbox}
      fit={fit}
    >
      {resource.type === 'video' ? (
        <VideoThumb proxyUrl={proxyUrl} fit={fit} />
      ) : resource.type === 'audio' ? (
        <IconThumb icon={<FileAudio size={24} />} />
      ) : resource.type === 'text' ? (
        <TextThumb proxyUrl={proxyUrl} name={resource.name} />
      ) : resource.type === 'image' ? (
        <ImageThumb proxyUrl={proxyUrl} alt={resource.name} />
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
      onDownload={() => downloadResource(proxyUrl, resource.name)}
    >
      {resource.type === 'video' ? (
        <AuthedVideo src={proxyUrl} controls autoPlay />
      ) : resource.type === 'audio' ? (
        <ResourceMediaAudioPanel icon={<FileAudio size={18} />} name={resource.name}>
          <AuthedAudio src={proxyUrl} controls autoPlay />
        </ResourceMediaAudioPanel>
      ) : resource.type === 'text' ? (
        <TextPreview proxyUrl={proxyUrl} />
      ) : resource.type === 'image' ? (
        <AuthedImage src={proxyUrl} alt={resource.name} />
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

function ImageThumb({ proxyUrl, alt }: { proxyUrl: string; alt: string }) {
  return <AuthedImage src={proxyUrl} alt={alt} />
}

function VideoThumb({ proxyUrl, fit }: { proxyUrl: string; fit: 'cover' | 'contain' }) {
  return (
    <ResourceMediaFillFrame fit={fit}>
      <AuthedVideo src={proxyUrl} muted playsInline preload="metadata" />
    </ResourceMediaFillFrame>
  )
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
    queryKey: ['resource-text-thumb', proxyUrl],
    queryFn: () => loadTextResource(proxyUrl),
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
    queryKey: ['resource-text-preview', proxyUrl],
    queryFn: () => loadTextResource(proxyUrl),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <ResourceMediaTextPreviewPanel loading={isLoading} loadingContent={t('common.loadingShort')}>
      <ResourceMediaCodeBlock>{data}</ResourceMediaCodeBlock>
    </ResourceMediaTextPreviewPanel>
  )
}
