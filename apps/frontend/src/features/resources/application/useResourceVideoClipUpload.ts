import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import type { RawResource } from '@/types'
import { api } from '@/shared/infrastructure/api'
import { toast } from '@/shared/ui/toastStore'
import { trimResourceVideoSegment } from '@/features/resources/application/resourceVideoClipElectron'
import { clipErrorMessage } from '@/features/resources/application/resourceVideoClipMessages'
import type { ResourceVideoClipStatusState } from '@/features/resources/application/useResourceVideoClipStatus'

export type ResourceVideoClipPhase = 'idle' | 'preparing' | 'clipping' | 'uploading'

export function useResourceVideoClipUpload({
  clipStatus,
  endMs,
  folderId,
  mode,
  onCreated,
  outputName,
  resource,
  sourceBlob,
  startMs,
  t,
}: {
  clipStatus: ResourceVideoClipStatusState
  endMs: number
  folderId?: number
  mode: 'accurate' | 'fast'
  onCreated: (created: RawResource) => void
  outputName: string
  resource: RawResource
  sourceBlob: Blob | null
  startMs: number
  t: TFunction
}) {
  const [clipError, setClipError] = useState('')
  const [clipPhase, setClipPhase] = useState<ResourceVideoClipPhase>('idle')

  const uploadClip = useMutation({
    mutationFn: async () => {
      if (!sourceBlob) throw new Error(t('pages.resources.clipSourceMissing'))
      if (!clipStatus.available) throw new Error(t('pages.resources.clipDesktopOnly'))
      setClipError('')
      setClipPhase('preparing')
      const sourceData = await sourceBlob.arrayBuffer()
      setClipPhase('clipping')
      const result = await trimResourceVideoSegment({
        sourceData,
        sourceName: resource.name,
        startMs,
        endMs,
        outputName,
        mode,
      })
      if (!result) throw new Error(t('pages.resources.clipDesktopOnly'))
      if (!result.ok || !result.data) {
        throw new Error(clipErrorMessage(result.code, result.error, t))
      }
      const clipBytes = new Uint8Array(result.data)
      const clipBuffer = clipBytes.buffer.slice(clipBytes.byteOffset, clipBytes.byteOffset + clipBytes.byteLength) as ArrayBuffer
      const file = new window.File([clipBuffer], result.outputName || outputName, { type: result.mimeType || 'video/mp4' })
      const fd = new FormData()
      fd.append('file', file)
      if (folderId) fd.append('folder_id', String(folderId))
      setClipPhase('uploading')
      const created = await api.post('/resources/upload', fd).then((r) => r.data as RawResource)
      return { created, fallbackApplied: result.fallbackApplied === true }
    },
    onSuccess: ({ created, fallbackApplied }) => {
      setClipPhase('idle')
      toast.success(t('pages.resources.clipCreated'), fallbackApplied ? t('pages.resources.clipFallbackApplied', { name: created.name }) : created.name)
      onCreated(created)
    },
    onError: (error) => {
      setClipPhase('idle')
      setClipError(error instanceof Error ? error.message : t('pages.resources.clipFailed'))
    },
  })

  return {
    clipError,
    clipPhase,
    isBusy: uploadClip.isPending,
    uploadClip,
  }
}
