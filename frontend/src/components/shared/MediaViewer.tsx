import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'
import { X, Maximize2, Download } from 'lucide-react'
import { AuthedImage } from './AuthedImage'
import { api } from '@/lib/api'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import { cn } from '@/lib/utils'
import type { RawResource } from '@/types'
import { useUserStore } from '@/store/userStore'

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

function resolveUrl(resource: RawResource, userId?: number): string {
  const uid = userId ? `?uid=${userId}` : ''
  return `${API_BASE}${resource.url}${uid}`
}

async function downloadResource(proxyUrl: string, name: string) {
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

/** Renders a thumbnail/preview of a resource; image or video.
 *  Pass `open` + `onOpenChange` to use as a controlled lightbox without a thumbnail. */
export function MediaViewer({ resource, className = '', fit = 'cover', lightbox = true, open: controlledOpen, onOpenChange }: MediaViewerProps) {
  const { t } = useTranslation()
  const [internalOpen, setInternalOpen] = useState(false)
  const userId = useUserStore(s => s.currentUser?.ID)
  const proxyUrl = resolveUrl(resource, userId)

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
      ) : (
        <ImageThumb proxyUrl={proxyUrl} alt={resource.name} fit={fit} />
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
              <video
                src={proxyUrl}
                controls
                autoPlay
                className="max-w-[90vw] max-h-[80vh] rounded-lg"
              />
            ) : (
              <AuthedImage
                src={proxyUrl}
                alt={resource.name}
                className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg"
              />
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
      <video src={proxyUrl} className={fit === 'contain' ? 'w-full h-full object-contain' : 'w-full h-full object-cover'} muted playsInline preload="metadata" />
    </div>
  )
}
