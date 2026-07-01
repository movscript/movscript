import { api } from '@admin/lib/api'
import { translateAPIRequestError } from '@admin/lib/apiError'
import type { RawResource } from '@admin/types'
import { Button } from '@movscript/ui/primitives'
import { ArrowUpRight, Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isImageResource, isVideoResource } from '../model/storageTypes'

export function ResourceDetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-foreground">{value}</div>
    </div>
  )
}

export function ResourceDetailPreview({ resource }: { resource: RawResource }) {
  const { t } = useTranslation()
  const [objectUrl, setObjectUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isImage = isImageResource(resource)
  const isVideo = isVideoResource(resource)
  const canPreview = isImage || isVideo

  useEffect(() => {
    if (!canPreview || resource.direct_url) {
      setObjectUrl('')
      setLoading(false)
      setError('')
      return
    }

    const controller = new AbortController()
    let createdUrl = ''
    setLoading(true)
    setError('')
    setObjectUrl('')

    api.get(`/admin/resource-storage/resources/${resource.ID}/file`, {
      responseType: 'blob',
      signal: controller.signal,
    }).then((response) => {
      createdUrl = URL.createObjectURL(response.data as Blob)
      setObjectUrl(createdUrl)
    }).catch((err) => {
      if (controller.signal.aborted) return
      setError(translateAPIRequestError(err))
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })

    return () => {
      controller.abort()
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [canPreview, resource.ID, resource.direct_url])

  const previewUrl = resource.direct_url || objectUrl
  const fileUrl = previewUrl || resource.direct_url || ''

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-foreground">{t('admin.storage.filePreview')}</h4>
        <div className="flex items-center gap-2">
          {fileUrl && (
            <>
              <Button asChild type="button" variant="outline" size="sm">
                <a href={fileUrl} target="_blank" rel="noreferrer">
                  <ArrowUpRight size={14} className="mr-2" />
                  {t('admin.storage.openFile')}
                </a>
              </Button>
              <Button asChild type="button" variant="outline" size="sm">
                <a href={fileUrl} download={resource.name}>
                  <Download size={14} className="mr-2" />
                  {t('admin.storage.downloadFile')}
                </a>
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
        {canPreview && previewUrl ? (
          isImage ? (
            <div className="flex max-h-[56vh] min-h-64 items-center justify-center bg-black/5 p-3">
              <img src={previewUrl} alt={resource.name} className="max-h-[52vh] max-w-full object-contain" />
            </div>
          ) : (
            <video
              src={previewUrl}
              controls
              preload="metadata"
              className="max-h-[56vh] w-full bg-black"
            />
          )
        ) : (
          <div className="flex min-h-32 items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground">
            {loading ? t('admin.storage.loadingPreview') : error || t('admin.storage.previewUnavailable')}
          </div>
        )}
      </div>
    </div>
  )
}
