import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  semanticEntityConfig,
  type SemanticEntityConfig,
  type SemanticEntityPayload,
} from '@/shared/infrastructure/api/semanticEntities'
import {
  buildPreProductionAssetRows,
  buildReferenceAssetClusters,
  type AssetKind,
  type AssetSlotCandidateRecord,
  type AssetSlotRecord,
  type SettingRecord,
} from '@/features/pre-production/domain/preProductionAssetRows'
import { buildPreProductionAssetSlotCreatePayload } from '@/features/pre-production/domain/preProductionAssetCandidateWrite'
import {
  loadPreProductionWorkspaceData,
  savePreProductionWorkspaceAssetSlot,
} from '@/features/pre-production/application/preProductionWorkspaceRepository'
import { toast } from '@/shared/ui/toastStore'

export const PRE_PRODUCTION_SETTINGS_QUERY_KEY = 'pre-production-settings'
export const PRE_PRODUCTION_ASSET_SLOTS_QUERY_KEY = 'semantic-asset-slots-page'
export const PRE_PRODUCTION_ASSET_SLOT_CANDIDATES_QUERY_KEY = 'semantic-asset-slot-candidates-page'
export const PRE_PRODUCTION_WORKSPACE_DATA_QUERY_KEY = 'pre-production-workspace-data'

export interface PreProductionDataQueryClient {
  invalidateQueries: (input: { queryKey: readonly unknown[] }) => Promise<unknown>
}

export interface PreProductionAssetSlotCreateMutationInput {
  kindFilter: AssetKind
  selectedId: number | null
  selectedReferenceId: number | null
  slots: AssetSlotRecord[]
}

export interface PreProductionAssetSlotCreateMutationVariables {
  selectedReferenceId?: number | null
}

export function preProductionSettingsQueryKey(projectId?: number) {
  return [PRE_PRODUCTION_SETTINGS_QUERY_KEY, projectId] as const
}

export function preProductionAssetSlotsQueryKey(projectId?: number) {
  return [PRE_PRODUCTION_ASSET_SLOTS_QUERY_KEY, projectId] as const
}

export function preProductionAssetSlotCandidatesQueryKey(projectId?: number) {
  return [PRE_PRODUCTION_ASSET_SLOT_CANDIDATES_QUERY_KEY, projectId] as const
}

export function preProductionWorkspaceDataQueryKey(projectId?: number) {
  return [PRE_PRODUCTION_WORKSPACE_DATA_QUERY_KEY, projectId] as const
}

export function isInternalPreProductionCandidateSlot(slot: AssetSlotRecord, candidateAssetSlotParentIds?: ReadonlyMap<number, number>) {
  if (String(slot.owner_type ?? '').trim() !== 'asset_slot') return false
  if (!candidateAssetSlotParentIds) return true
  const parentSlotId = candidateAssetSlotParentIds.get(slot.ID)
  return Boolean(parentSlotId && slot.owner_id === parentSlotId)
}

export function buildWorkspaceAssetSlotCandidates(slots: AssetSlotRecord[]): AssetSlotCandidateRecord[] {
  return slots
    .filter((slot) => String(slot.owner_type ?? '').trim() === 'asset_slot' && typeof slot.owner_id === 'number' && slot.owner_id > 0)
    .map((slot) => {
      const parent = slots.find((item) => item.ID === slot.owner_id)
      const id = -stablePositiveHash(`workspace-candidate:${slot.owner_id}:${slot.ID}:${slot.client_id ?? ''}`)
      return {
        ID: id,
        id,
        asset_slot_id: slot.owner_id,
        candidate_asset_slot_id: slot.ID,
        candidate_asset_slot: slot,
        source_type: 'workspace',
        source_id: slot.resource_id,
        score: 0,
        status: parent?.locked_asset_slot_id === slot.ID ? 'selected' : (slot.status === 'rejected' ? 'rejected' : 'candidate'),
      } satisfies AssetSlotCandidateRecord
    })
}

export function buildWorkspaceAssetSlotCandidateRecords(candidates: AssetSlotCandidateRecord[]): AssetSlotCandidateRecord[] {
  return candidates.map((candidate) => ({
    ...candidate,
    status: candidate.status ?? 'candidate',
  }))
}

function requirePreProductionProjectId(projectId?: number) {
  if (!projectId) throw new Error('请先选择项目')
  return projectId
}

export function usePreProductionWorkbenchData(projectId?: number) {
  const slotConfig = useMemo(() => semanticEntityConfig('assetSlots'), [])
  const candidateConfig = useMemo(() => semanticEntityConfig('assetSlotCandidates'), [])
  const referenceConfig = useMemo(() => semanticEntityConfig('settings'), [])

  const workspaceDataQuery = useQuery({
    queryKey: preProductionWorkspaceDataQueryKey(projectId),
    queryFn: () => loadPreProductionWorkspaceData(projectId!),
    enabled: !!projectId,
  })

  const settings = workspaceDataQuery.data?.settings ?? []
  const slots = workspaceDataQuery.data?.assetSlots ?? []
  const candidates = useMemo(() => [
    ...buildWorkspaceAssetSlotCandidates(slots),
    ...buildWorkspaceAssetSlotCandidateRecords(workspaceDataQuery.data?.candidates ?? []),
  ], [slots, workspaceDataQuery.data?.candidates])
  const visibleSlots = useMemo(() => slots.filter((slot) => !isInternalPreProductionCandidateSlot(slot)), [slots])
  const slotById = useMemo(() => new Map(slots.map((slot) => [slot.ID, slot])), [slots])
  const rows = useMemo(() => buildPreProductionAssetRows(visibleSlots, candidates, slotById), [candidates, slotById, visibleSlots])
  const referenceById = useMemo(() => new Map(settings.map((reference) => [reference.ID, reference])), [settings])
  const clusters = useMemo(() => buildReferenceAssetClusters(settings, rows), [settings, rows])

  return {
    slotConfig,
    candidateConfig,
    referenceConfig,
    workspaceDataQuery,
    workspaceProjectPath: workspaceDataQuery.data?.projectPath,
    settingsQuery: workspaceDataQuery,
    slotsQuery: workspaceDataQuery,
    candidatesQuery: workspaceDataQuery,
    settings,
    slots,
    candidates,
    visibleSlots,
    rows,
    referenceById,
    clusters,
    isLoading: workspaceDataQuery.isLoading,
    isFetching: workspaceDataQuery.isFetching,
  }
}

export function buildUpdatePreProductionAssetSlotMutationOptions({
  projectId,
  queryClient,
  slotConfig,
}: {
  projectId?: number
  queryClient: PreProductionDataQueryClient
  slotConfig: SemanticEntityConfig
}) {
  return {
    mutationFn: async ({ id, payload }: { id: number; payload: SemanticEntityPayload }) => {
      const scopedProjectId = requirePreProductionProjectId(projectId)
      const workspaceData = await loadPreProductionWorkspaceData(scopedProjectId)
      const record = workspaceData.assetSlots.find((slot) => slot.ID === id) ?? ({ ID: id } as AssetSlotRecord)
      return savePreProductionWorkspaceAssetSlot(scopedProjectId, record, payload)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: preProductionWorkspaceDataQueryKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: preProductionAssetSlotsQueryKey(projectId) }),
      ])
    },
  }
}

export function buildCreatePreProductionAssetSlotMutationOptions({
  projectId,
  queryClient,
  slotConfig,
  getInput,
  onCreated,
}: {
  projectId?: number
  queryClient: PreProductionDataQueryClient
  slotConfig: SemanticEntityConfig
  getInput: () => PreProductionAssetSlotCreateMutationInput
  onCreated?: (record: AssetSlotRecord) => void
}) {
  return {
    mutationFn: (variables?: PreProductionAssetSlotCreateMutationVariables) => {
      const scopedProjectId = requirePreProductionProjectId(projectId)
      const input = getInput()
      return savePreProductionWorkspaceAssetSlot(scopedProjectId, null, buildPreProductionAssetSlotCreatePayload({
        ...input,
        selectedReferenceId: variables?.selectedReferenceId ?? input.selectedReferenceId,
      }) as SemanticEntityPayload) as Promise<AssetSlotRecord>
    },
    onSuccess: async (record: AssetSlotRecord) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: preProductionWorkspaceDataQueryKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: preProductionAssetSlotsQueryKey(projectId) }),
      ])
      onCreated?.(record)
      toast.success('素材需求已写入当前工作区')
    },
  }
}

function stablePositiveHash(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 31) + value.charCodeAt(index)) >>> 0
  }
  return (hash % 2_000_000_000) + 1
}
