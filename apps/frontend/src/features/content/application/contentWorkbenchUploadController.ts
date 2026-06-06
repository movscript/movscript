import { useRef, useState, type RefObject } from 'react'

import { api } from '@/shared/infrastructure/api'
import { invalidateAssetCandidateConsumers } from '@/shared/infrastructure/assetCandidateQueryInvalidation'
import { createWorkspaceAssetSlotCandidate } from '@/shared/infrastructure/workspaceCandidateRepository'
import { buildContentCandidateAttachmentPayload } from '@/features/content/domain/contentWorkbenchWriteModel'
import { apiErrorMessage } from '@/features/content/domain/contentWorkbenchStatus'
import type { ContentWorkbenchRecord } from '@/features/content/domain/contentWorkbenchModel'
import { toast } from '@/shared/ui/toastStore'
import type { RawResource } from '@/types'

export interface ContentWorkbenchUploadQueryClient {
  invalidateQueries: (input: { queryKey: unknown[] }) => Promise<unknown>
}

export interface ContentWorkbenchCandidateUploadInputState {
  inputRef: RefObject<HTMLInputElement>
  uploading: boolean
  triggerUpload: (slot: ContentWorkbenchRecord | null | undefined, disabled?: boolean) => void
  uploadFile: (
    file: File | undefined,
    fallbackSlot: ContentWorkbenchRecord | null | undefined,
    options: {
      disabled?: boolean
      onUpload: (input: { file: File; slot: ContentWorkbenchRecord }) => void
    },
  ) => void
  resetUpload: () => void
}

export function useContentWorkbenchCandidateUploadInput(): ContentWorkbenchCandidateUploadInputState {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [targetSlot, setTargetSlot] = useState<ContentWorkbenchRecord | null>(null)

  function clearInput() {
    if (inputRef.current) inputRef.current.value = ''
  }

  function resetUpload() {
    setUploading(false)
    setTargetSlot(null)
    clearInput()
  }

  function triggerUpload(slot: ContentWorkbenchRecord | null | undefined, disabled = false) {
    if (!slot || disabled) return
    setTargetSlot(slot)
    inputRef.current?.click()
  }

  function uploadFile(
    file: File | undefined,
    fallbackSlot: ContentWorkbenchRecord | null | undefined,
    options: {
      disabled?: boolean
      onUpload: (input: { file: File; slot: ContentWorkbenchRecord }) => void
    },
  ) {
    const slot = targetSlot ?? fallbackSlot
    if (!file || !slot) {
      resetUpload()
      return
    }
    if (options.disabled) return
    setUploading(true)
    options.onUpload({ file, slot })
  }

  return {
    inputRef: inputRef as RefObject<HTMLInputElement>,
    uploading,
    triggerUpload,
    uploadFile,
    resetUpload,
  }
}

export function buildContentWorkbenchUploadCandidateMutationOptions({
  projectId,
  queryClient,
  onSettled,
}: {
  projectId?: number
  queryClient: ContentWorkbenchUploadQueryClient
  onSettled?: () => void
}) {
  return {
    mutationFn: async ({ file, slot }: { file: File; slot: ContentWorkbenchRecord }) => {
      if (!projectId) throw new Error('请先选择项目')
      const formData = new FormData()
      formData.append('file', file)
      const resource = await api.post('/resources/upload', formData).then((response) => response.data as RawResource)
      await createWorkspaceAssetSlotCandidate(projectId, buildContentCandidateAttachmentPayload(slot, resource), slot)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['resources'] })
      invalidateAssetCandidateConsumers(queryClient, projectId)
      toast.success('候选已上传')
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, '上传候选失败'))
    },
    onSettled: () => {
      onSettled?.()
    },
  }
}
