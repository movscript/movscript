import { Database, Image, Upload, Video } from 'lucide-react'

import { EmptyPreview, SlotStatusBadge, SlotThumb } from '@/features/pre-production/components/PreProductionAssetBoard'
import {
  ResourceAssetCandidateActionButton,
  ResourceAssetCandidateActions,
  ResourceAssetCandidateBody,
  ResourceAssetCandidateCard,
  ResourceAssetCandidateContent,
  ResourceAssetCandidateList,
  ResourceAssetCandidateMeta,
  ResourceAssetCandidateSection,
  ResourceAssetCandidateStatus,
  ResourceAssetCandidateThumb,
  ResourceAssetCandidateTitle,
  ResourceAssetCandidateToolbar,
  ResourceAssetCandidateToolbarActions,
  ResourceAssetCandidateToolbarButton,
  ResourceAssetDetailCopy,
  ResourceAssetDetailEmptySlot,
  ResourceAssetDetailHeader,
  ResourceAssetDetailMetricGrid,
  ResourceAssetDetailRoot,
  ResourceAssetDetailSubtitle,
  ResourceAssetDetailTitle,
  WorkbenchKeyValue,
} from '@movscript/ui'
import {
  assetKindLabel,
  assetSlotHasLoadedResource,
  normalizeSlotStatus,
  slotScopeLabel,
  type AssetSlotCandidateRecord,
  type AssetSlotViewModel,
} from '@/features/pre-production/domain/preProductionAssetRows'
import type { PreProductionCandidateGenerationKind } from '@/features/pre-production/domain/preProductionAssetCandidateWrite'
import { assetSlotAction } from '@/shared/domain/productionTerminology'
import { preProductionCandidateAvailabilityRecipe } from '@/features/pre-production/presentation/preProductionSemanticUi'

type CandidateGenerationKind = PreProductionCandidateGenerationKind

export function AssetSlotDetail({
  row,
  onLock,
  onReject,
  onUploadCandidate,
  onOpenResourceLibrary,
  onGenerateMediaCandidate,
  busy,
  uploading,
}: {
  row: AssetSlotViewModel | null
  onLock: (candidate: AssetSlotCandidateRecord) => void
  onReject: (candidate: AssetSlotCandidateRecord) => void
  onUploadCandidate: () => void
  onOpenResourceLibrary: () => void
  onGenerateCandidate: (kind: CandidateGenerationKind) => void
  onGenerateMediaCandidate: (kind: CandidateGenerationKind) => void
  onOpenAssistant: () => void
  onOpenCanvas: () => void
  busy: boolean
  uploading: boolean
  generatingKind?: CandidateGenerationKind
}) {
  if (!row) {
    return (
      <ResourceAssetDetailEmptySlot>
        <EmptyPreview title="选择素材" description="查看可选素材，并选择或拒绝。" />
      </ResourceAssetDetailEmptySlot>
    )
  }
  const slot = row.slot
  const preferredKind: CandidateGenerationKind = row.kind === 'video' ? 'video' : 'image'
  const canGenerate = row.kind === 'image' || row.kind === 'video'
  const nextAction = assetSlotAction({ status: normalizeSlotStatus(slot.status), candidateCount: row.candidates.length, hasResource: row.hasResource })
  return (
    <ResourceAssetDetailRoot>
      <ResourceAssetDetailHeader>
        <ResourceAssetDetailCopy>
          <ResourceAssetDetailTitle>可选素材</ResourceAssetDetailTitle>
          <ResourceAssetDetailSubtitle>{slot.name || `素材需求 #${slot.ID}`} · {slotScopeLabel(slot)}</ResourceAssetDetailSubtitle>
        </ResourceAssetDetailCopy>
        <SlotStatusBadge status={normalizeSlotStatus(slot.status)} />
      </ResourceAssetDetailHeader>

      <SlotThumb slot={row.lockedSlot ?? slot} fit="contain" ratio="banner" frame="banner" />

      <ResourceAssetDetailMetricGrid>
        <WorkbenchKeyValue label="类型" value={assetKindLabel(row.kind)} />
        <WorkbenchKeyValue label="下一步" value={nextAction.label} />
      </ResourceAssetDetailMetricGrid>

      <ResourceAssetCandidateSection>
        <ResourceAssetCandidateToolbar>
          <ResourceAssetDetailTitle>候选列表</ResourceAssetDetailTitle>
          <ResourceAssetCandidateToolbarActions>
            {canGenerate ? (
              <ResourceAssetCandidateToolbarButton variant="soft" disabled={busy} onClick={() => onGenerateMediaCandidate(preferredKind)}>
                {preferredKind === 'video' ? <Video size={14} /> : <Image size={14} />}
                生成候选
              </ResourceAssetCandidateToolbarButton>
            ) : null}
            <ResourceAssetCandidateToolbarButton variant="outline" disabled={busy} onClick={onUploadCandidate}>
              <Upload size={14} />
              {uploading ? '上传中' : '上传'}
            </ResourceAssetCandidateToolbarButton>
            <ResourceAssetCandidateToolbarButton variant="outline" disabled={busy} onClick={onOpenResourceLibrary}>
              <Database size={14} />
              资源库
            </ResourceAssetCandidateToolbarButton>
          </ResourceAssetCandidateToolbarActions>
        </ResourceAssetCandidateToolbar>
        <ResourceAssetCandidateList>
          {row.candidates.length === 0 ? <EmptyPreview title="暂无候选" description={canGenerate ? '可以生成候选、上传已有素材，或从资源库选择。' : '可以上传已有素材，或从资源库选择。'} /> : null}
          {row.candidates.map((candidate) => (
            <CandidateRow
              key={candidate.ID}
              candidate={candidate}
              selected={slot.locked_asset_slot_id === candidate.candidate_asset_slot_id || candidate.status === 'selected'}
              onConfirm={() => onLock(candidate)}
              onReject={() => onReject(candidate)}
              busy={busy}
            />
          ))}
        </ResourceAssetCandidateList>
      </ResourceAssetCandidateSection>
    </ResourceAssetDetailRoot>
  )
}

function CandidateRow({
  candidate,
  selected,
  onConfirm,
  onReject,
  busy,
}: {
  candidate: AssetSlotCandidateRecord
  selected: boolean
  onConfirm: () => void
  onReject: () => void
  busy: boolean
}) {
  const slot = candidate.candidate_asset_slot
  const canLock = selected || assetSlotHasLoadedResource(slot)
  return (
    <ResourceAssetCandidateCard active={selected}>
      <ResourceAssetCandidateContent>
        <ResourceAssetCandidateThumb>
          <SlotThumb slot={slot} fit="contain" />
        </ResourceAssetCandidateThumb>
        <ResourceAssetCandidateBody>
          <ResourceAssetCandidateTitle>{slot?.name || `素材需求 #${candidate.candidate_asset_slot_id}`}</ResourceAssetCandidateTitle>
          <ResourceAssetCandidateMeta>{candidate.note || sourceTypeLabel(candidate.source_type)}</ResourceAssetCandidateMeta>
          {slot && !assetSlotHasLoadedResource(slot) ? (
            <ResourceAssetCandidateStatus {...preProductionCandidateAvailabilityRecipe(false)} label="候选资源不存在或未加载，暂不能锁定" />
          ) : null}
        </ResourceAssetCandidateBody>
      </ResourceAssetCandidateContent>
      <ResourceAssetCandidateActions>
        <ResourceAssetCandidateActionButton disabled={selected || busy || !candidate.candidate_asset_slot_id || !canLock} onClick={onConfirm}>
          {selected ? '已选定' : canLock ? '锁定此候选' : '缺资源'}
        </ResourceAssetCandidateActionButton>
        <ResourceAssetCandidateActionButton variant="outline" disabled={selected || busy || !candidate.candidate_asset_slot_id} onClick={onReject}>
          拒绝
        </ResourceAssetCandidateActionButton>
      </ResourceAssetCandidateActions>
    </ResourceAssetCandidateCard>
  )
}

function sourceTypeLabel(sourceType?: string): string {
  if (!sourceType) return '候选'
  const labels: Record<string, string> = {
    manual: '手动添加',
    ai: 'AI 生成',
    ai_agent: 'AI 助手生成',
    upload: '上传',
    job: '任务生成',
    canvas: '画布生成',
  }
  return labels[sourceType] ?? sourceType
}
