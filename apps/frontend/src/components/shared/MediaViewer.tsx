import { useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'
import { X, Maximize2, Download, FileAudio, FileText, File } from 'lucide-react'
import { AuthedImage, AuthedVideo } from './AuthedImage'
import { api } from '@/lib/api'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import { cn } from '@/lib/utils'
import type { RawResource } from '@/types'

interface MediaViewerProps {
  resource: RawResource
  className?: string
  fit?: 'cover' | 'contain'
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
export function MediaViewer({ resource, className = '', fit = 'cover', lightbox = true, open: controlledOpen, onOpenChange }: MediaViewerProps) {
  const { t } = useTranslation()
  const [internalOpen, setInternalOpen] = useState(false)
  const proxyUrl = resolveResourceUrl(resource)

  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled ? (v: boolean) => onOpenChange?.(v) : setInternalOpen

  const thumb = (
    <div
      className={cn('relative group overflow-hidden rounded-lg bg-muted', className)}
      onClick={() => lightbox && setOpen(true)}
      style={{ cursor: lightbox ? 'pointer' : 'default' }}
    >
      {resource.type === 'video' ? (
        <VideoThumb proxyUrl={proxyUrl} fit={fit} />
      ) : resource.type === 'audio' ? (
        <IconThumb icon={<FileAudio size={24} />} />
      ) : resource.type === 'text' ? (
        <TextThumb proxyUrl={proxyUrl} name={resource.name} />
      ) : resource.type === 'image' ? (
        <ImageThumb proxyUrl={proxyUrl} alt={resource.name} fit={fit} />
      ) : (
        <IconThumb icon={<File size={24} />} />
      )}
      {lightbox && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <Maximize2 size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
        </div>
      )}
    </div>
  )

  const lightboxDialog = (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 z-50 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4 shrink-0">
              <span className="text-white/80 text-sm truncate max-w-[60vw]">{resource.name}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadResource(proxyUrl, resource.name)}
                  className="text-white/70 hover:text-white transition-colors"
                  title={t('shared.mediaViewer.download')}
                >
                  <Download size={16} />
                </button>
                <Dialog.Close className="text-white/70 hover:text-white transition-colors">
                  <X size={18} />
                </Dialog.Close>
              </div>
            </div>

            {resource.type === 'video' ? (
              <AuthedVideo
                src={proxyUrl}
                controls
                autoPlay
                className="max-w-[90vw] max-h-[80vh] rounded-lg"
              />
            ) : resource.type === 'audio' ? (
              <div className="w-[min(640px,90vw)] rounded-lg bg-background p-5">
                <div className="flex items-center gap-3 mb-4 text-foreground">
                  <FileAudio size={18} />
                  <span className="text-sm truncate">{resource.name}</span>
                </div>
                <audio src={proxyUrl} controls autoPlay className="w-full" />
              </div>
            ) : resource.type === 'text' ? (
              <TextPreview proxyUrl={proxyUrl} />
            ) : resource.type === 'image' ? (
              <AuthedImage
                src={proxyUrl}
                alt={resource.name}
                className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg"
              />
            ) : (
              <div className="w-[min(520px,90vw)] rounded-lg bg-background p-6 text-center text-muted-foreground">
                <File size={28} className="mx-auto mb-3" />
                <p className="text-sm">{resource.name}</p>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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

function ImageThumb({ proxyUrl, alt, fit }: { proxyUrl: string; alt: string; fit: 'cover' | 'contain' }) {
  return <AuthedImage src={proxyUrl} alt={alt} className={fit === 'contain' ? 'w-full h-full object-contain' : 'w-full h-full object-cover'} />
}

function VideoThumb({ proxyUrl, fit }: { proxyUrl: string; fit: 'cover' | 'contain' }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-muted/50">
      <AuthedVideo src={proxyUrl} className={fit === 'contain' ? 'w-full h-full object-contain' : 'w-full h-full object-cover'} muted playsInline preload="metadata" />
    </div>
  )
}

function IconThumb({ icon }: { icon: ReactNode }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-muted/50 text-muted-foreground">
      {icon}
    </div>
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
    <div className="w-full h-full bg-muted/50 p-2 text-left overflow-hidden">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        <FileText size={12} />
        <span className="text-[10px] truncate">{name}</span>
      </div>
      <pre className="text-[10px] leading-4 whitespace-pre-wrap break-words text-foreground/80 font-mono">
        {preview || name}
      </pre>
    </div>
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
    <div className="w-[min(900px,90vw)] h-[min(720px,80vh)] rounded-lg bg-background border border-white/10 overflow-hidden">
      <div className="h-full overflow-auto p-4">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{t('common.loadingShort')}</div>
        ) : (
          <pre className="text-sm leading-6 whitespace-pre-wrap break-words text-foreground font-mono">{data}</pre>
        )}
      </div>
    </div>
  )
}
