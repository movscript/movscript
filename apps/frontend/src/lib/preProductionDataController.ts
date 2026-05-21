import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  createSemanticEntity,
  listSemanticEntities,
  semanticEntityConfig,
  updateSemanticEntity,
  type SemanticEntityConfig,
  type SemanticEntityPayload,
} from '@/api/semanticEntities'
import {
  buildPreProductionAssetRows,
  buildReferenceAssetClusters,
  type AssetKind,
  type AssetSlotCandidateRecord,
  type AssetSlotRecord,
  type CreativeReferenceRecord,
} from '@/lib/preProductionAssetRows'
import { buildPreProductionAssetSlotCreatePayload } from '@/lib/preProductionAssetCandidateWrite'
import { toast } from '@/store/toastStore'

export const PRE_PRODUCTION_CREATIVE_REFERENCES_QUERY_KEY = 'pre-production-creative-references'
export const PRE_PRODUCTION_ASSET_SLOTS_QUERY_KEY = 'semantic-asset-slots-page'
export const PRE_PRODUCTION_ASSET_SLOT_CANDIDATES_QUERY_KEY = 'semantic-asset-slot-candidates-page'

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

export function preProductionCreativeReferencesQueryKey(projectId?: number) {
  return [PRE_PRODUCTION_CREATIVE_REFERENCES_QUERY_KEY, projectId] as const
}

export function preProductionAssetSlotsQueryKey(projectId?: number) {
  return [PRE_PRODUCTION_ASSET_SLOTS_QUERY_KEY, projectId] as const
}

export function preProductionAssetSlotCandidatesQueryKey(projectId?: number) {
  return [PRE_PRODUCTION_ASSET_SLOT_CANDIDATES_QUERY_KEY, projectId] as const
}

export function isInternalPreProductionCandidateSlot(slot: AssetSlotRecord) {
  return slot.owner_type === 'asset_slot'
}

function requirePreProductionProjectId(projectId?: number) {
  if (!projectId) throw new Error('请先选择项目')
  return projectId
}

export function usePreProductionWorkbenchData(projectId?: number) {
  const slotConfig = useMemo(() => semanticEntityConfig('assetSlots'), [])
  const candidateConfig = useMemo(() => semanticEntityConfig('assetSlotCandidates'), [])
  const referenceConfig = useMemo(() => semanticEntityConfig('creativeReferences'), [])

  const creativeReferencesQuery = useQuery({
    queryKey: preProductionCreativeReferencesQueryKey(projectId),
    queryFn: () => listSemanticEntities(projectId!, referenceConfig) as Promise<CreativeReferenceRecord[]>,
    enabled: !!projectId,
  })

  const slotsQuery = useQuery({
    queryKey: preProductionAssetSlotsQueryKey(projectId),
    queryFn: () => listSemanticEntities(projectId!, slotConfig) as Promise<AssetSlotRecord[]>,
    enabled: !!projectId,
  })

  const candidatesQuery = useQuery({
    queryKey: preProductionAssetSlotCandidatesQueryKey(projectId),
    queryFn: () => listSemanticEntities(projectId!, candidateConfig) as Promise<AssetSlotCandidateRecord[]>,
    enabled: !!projectId,
  })

  const creativeReferences = creativeReferencesQuery.data ?? []
  const slots = slotsQuery.data ?? []
  const candidates = candidatesQuery.data ?? []
  const visibleSlots = useMemo(() => slots.filter((slot) => !isInternalPreProductionCandidateSlot(slot)), [slots])
  const slotById = useMemo(() => new Map(slots.map((slot) => [slot.ID, slot])), [slots])
  const rows = useMemo(() => buildPreProductionAssetRows(visibleSlots, candidates, slotById), [candidates, slotById, visibleSlots])
  const referenceById = useMemo(() => new Map(creativeReferences.map((reference) => [reference.ID, reference])), [creativeReferences])
  const clusters = useMemo(() => buildReferenceAssetClusters(creativeReferences, rows), [creativeReferences, rows])

  return {
    slotConfig,
    candidateConfig,
    referenceConfig,
    creativeReferencesQuery,
    slotsQuery,
    candidatesQuery,
    creativeReferences,
    slots,
    candidates,
    visibleSlots,
    rows,
    referenceById,
    clusters,
    isLoading: slotsQuery.isLoading,
    isFetching: creativeReferencesQuery.isFetching || slotsQuery.isFetching || candidatesQuery.isFetching,
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
    mutationFn: ({ id, payload }: { id: number; payload: SemanticEntityPayload }) =>
      updateSemanticEntity(requirePreProductionProjectId(projectId), slotConfig, id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: preProductionAssetSlotsQueryKey(projectId) }),
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
      return createSemanticEntity(scopedProjectId, slotConfig, buildPreProductionAssetSlotCreatePayload({
        ...input,
        selectedReferenceId: variables?.selectedReferenceId ?? input.selectedReferenceId,
      })) as Promise<AssetSlotRecord>
    },
    onSuccess: async (record: AssetSlotRecord) => {
      await queryClient.invalidateQueries({ queryKey: preProductionAssetSlotsQueryKey(projectId) })
      onCreated?.(record)
      toast.success('素材需求已创建')
    },
  }
}
