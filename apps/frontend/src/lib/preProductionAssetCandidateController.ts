import type { SemanticEntityPayload } from '@/api/semanticEntities'
import { api } from '@/lib/api'
import { invalidateAssetCandidateConsumers } from '@/lib/assetCandidateQueryInvalidation'
import {
  buildPreProductionLibraryCandidatePayload,
  buildPreProductionUploadCandidatePayload,
} from '@/lib/preProductionAssetCandidateWrite'
import {
  assetSlotHasLoadedResource,
  buildAssetCandidatePatchPayload,
  type AssetSlotCandidateRecord,
  type AssetSlotViewModel,
} from '@/lib/preProductionAssetRows'
import { toast } from '@/store/toastStore'
import type { RawResource } from '@/types'

export interface PreProductionCandidateQueryClient {
  invalidateQueries: (input: { queryKey: unknown[] }) => Promise<unknown>
}

export interface PreProductionCandidateMutationOptions {
  projectId?: number
  queryClient: PreProductionCandidateQueryClient
}

function requirePreProductionProjectId(projectId?: number) {
  if (!projectId) throw new Error('请先选择项目')
  return projectId
}

function showPreProductionCandidateError(error: unknown, fallback: string) {
  toast.error(error instanceof Error ? error.message : fallback)
}

export function invalidatePreProductionAssetCandidateState(
  queryClient: PreProductionCandidateQueryClient,
  projectId?: number,
) {
  invalidateAssetCandidateConsumers(queryClient, projectId)
}

export async function selectPreProductionAssetCandidate({
  projectId,
  row,
  candidate,
}: {
  projectId?: number
  row: AssetSlotViewModel
  candidate: AssetSlotCandidateRecord
}) {
  const scopedProjectId = requirePreProductionProjectId(projectId)
  if (!candidate.candidate_asset_slot_id) throw new Error('候选缺少素材位')
  if (!assetSlotHasLoadedResource(candidate.candidate_asset_slot)) throw new Error('候选资源不存在或未加载')
  await api.patch(
    `/projects/${scopedProjectId}/entities/asset-slot-candidates/${candidate.ID}`,
    buildAssetCandidatePatchPayload(row.slot.ID, candidate, 'selected'),
  )
}

export async function rejectPreProductionAssetCandidate({
  projectId,
  row,
  candidate,
}: {
  projectId?: number
  row: AssetSlotViewModel
  candidate: AssetSlotCandidateRecord
}) {
  const scopedProjectId = requirePreProductionProjectId(projectId)
  if (!candidate.candidate_asset_slot_id) throw new Error('候选缺少素材位')
  await api.patch(
    `/projects/${scopedProjectId}/entities/asset-slot-candidates/${candidate.ID}`,
    buildAssetCandidatePatchPayload(row.slot.ID, candidate, 'rejected'),
  )
}

export async function addPreProductionAssetCandidate({
  projectId,
  payload,
}: {
  projectId?: number
  payload: SemanticEntityPayload
}) {
  const scopedProjectId = requirePreProductionProjectId(projectId)
  return api.post(`/projects/${scopedProjectId}/entities/asset-slot-candidates`, payload).then((response) => response.data)
}

export async function attachPreProductionLibraryCandidate({
  projectId,
  row,
  resource,
}: {
  projectId?: number
  row: AssetSlotViewModel
  resource: RawResource
}) {
  await addPreProductionAssetCandidate({
    projectId,
    payload: buildPreProductionLibraryCandidatePayload(row, resource),
  })
}

export async function uploadPreProductionAssetCandidate({
  projectId,
  row,
  file,
}: {
  projectId?: number
  row: AssetSlotViewModel | null
  file: File
}) {
  requirePreProductionProjectId(projectId)
  if (!row) throw new Error('请先选择素材需求')
  const formData = new FormData()
  formData.append('file', file)
  const resource = await api.post('/resources/upload', formData).then((response) => response.data as RawResource)
  await addPreProductionAssetCandidate({
    projectId,
    payload: buildPreProductionUploadCandidatePayload(row, resource),
  })
}

export function buildPreProductionLockCandidateMutationOptions({
  projectId,
  queryClient,
}: PreProductionCandidateMutationOptions) {
  return {
    mutationFn: ({ row, candidate }: { row: AssetSlotViewModel; candidate: AssetSlotCandidateRecord }) =>
      selectPreProductionAssetCandidate({ projectId, row, candidate }),
    onSuccess: () => {
      invalidatePreProductionAssetCandidateState(queryClient, projectId)
      toast.success('素材已选定')
    },
    onError: (error: unknown) => {
      showPreProductionCandidateError(error, '选定素材失败')
    },
  }
}

export function buildPreProductionRejectCandidateMutationOptions({
  projectId,
  queryClient,
}: PreProductionCandidateMutationOptions) {
  return {
    mutationFn: ({ row, candidate }: { row: AssetSlotViewModel; candidate: AssetSlotCandidateRecord }) =>
      rejectPreProductionAssetCandidate({ projectId, row, candidate }),
    onSuccess: () => {
      invalidatePreProductionAssetCandidateState(queryClient, projectId)
      toast.success('素材候选已拒绝')
    },
    onError: (error: unknown) => {
      showPreProductionCandidateError(error, '拒绝候选失败')
    },
  }
}

export function buildPreProductionAddCandidateMutationOptions({
  projectId,
  queryClient,
}: PreProductionCandidateMutationOptions) {
  return {
    mutationFn: (payload: SemanticEntityPayload) => addPreProductionAssetCandidate({ projectId, payload }),
    onSuccess: () => {
      invalidatePreProductionAssetCandidateState(queryClient, projectId)
    },
  }
}

export function buildPreProductionAttachLibraryCandidateMutationOptions({
  projectId,
  queryClient,
  onAttached,
}: PreProductionCandidateMutationOptions & { onAttached?: () => void }) {
  return {
    mutationFn: ({ row, resource }: { row: AssetSlotViewModel; resource: RawResource }) =>
      attachPreProductionLibraryCandidate({ projectId, row, resource }),
    onSuccess: () => {
      onAttached?.()
      invalidatePreProductionAssetCandidateState(queryClient, projectId)
      toast.success('资源已加入候选')
    },
    onError: (error: unknown) => {
      showPreProductionCandidateError(error, '加入资源候选失败')
    },
  }
}

export function buildPreProductionUploadCandidateMutationOptions({
  projectId,
  queryClient,
  getRow,
  onSettled,
}: PreProductionCandidateMutationOptions & {
  getRow: () => AssetSlotViewModel | null
  onSettled?: () => void
}) {
  return {
    mutationFn: (file: File) => uploadPreProductionAssetCandidate({ projectId, row: getRow(), file }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['resources'] })
      invalidatePreProductionAssetCandidateState(queryClient, projectId)
      toast.success('候选已上传')
    },
    onError: (error: unknown) => {
      showPreProductionCandidateError(error, '上传候选失败')
    },
    onSettled: () => {
      onSettled?.()
    },
  }
}
