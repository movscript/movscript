import { Database, Image, Upload, Video } from 'lucide-react'

import { EmptyPreview, SlotStatusBadge, SlotThumb } from '@/components/workbench/PreProductionAssetBoard'
import { WorkbenchKeyValue } from '@/components/workbench/WorkbenchPrimitives'
import {
  assetKindLabel,
  assetSlotHasLoadedResource,
  normalizeSlotStatus,
  slotScopeLabel,
  type AssetSlotCandidateRecord,
  type AssetSlotViewModel,
  type SlotStatus,
} from '@/lib/preProductionAssetRows'
import type { PreProductionCandidateGenerationKind } from '@/lib/preProductionAssetCandidateWrite'
import { cn } from '@/lib/utils'
import { Button } from '@movscript/ui'

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
      <section className="rounded-lg border border-border bg-card p-3">
        <EmptyPreview title="选择素材" description="查看可选素材，并选择或拒绝。" />
      </section>
    )
  }
  const slot = row.slot
  const preferredKind: CandidateGenerationKind = row.kind === 'video' ? 'video' : 'image'
  const canGenerate = row.kind === 'image' || row.kind === 'video'
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-label font-semibold text-foreground">可选素材</p>
          <p className="mt-1 truncate type-label text-muted-foreground">{slot.name || `素材需求 #${slot.ID}`} · {slotScopeLabel(slot)}</p>
        </div>
        <SlotStatusBadge status={normalizeSlotStatus(slot.status)} />
      </div>

      <SlotThumb slot={row.lockedSlot ?? slot} fit="contain" className="aspect-[16/7] max-h-44 w-full rounded-md border border-border" />

      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="类型" value={assetKindLabel(row.kind)} />
        <MiniStat label="状态" value={slotStatusLabel(normalizeSlotStatus(slot.status))} />
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="type-label font-medium text-foreground">候选列表</p>
          <div className="flex flex-wrap justify-end gap-1.5">
            {canGenerate ? (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => onGenerateMediaCandidate(preferredKind)}>
                {preferredKind === 'video' ? <Video size={13} /> : <Image size={13} />}
                生成候选
              </Button>
            ) : null}
            <Button size="sm" variant="outline" disabled={busy} onClick={onUploadCandidate}>
              <Upload size={13} />
              {uploading ? '上传中' : '上传'}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={onOpenResourceLibrary}>
              <Database size={13} />
              资源库
            </Button>
          </div>
        </div>
        <div className="space-y-2">
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
        </div>
      </section>
    </section>
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
    <div className={cn('workbench-list-item p-2', selected && 'border-primary bg-primary/5 shadow-[0_0_0_1px_hsl(var(--primary)/0.28)]')}>
      <div className="flex gap-2">
        <SlotThumb slot={slot} fit="contain" className="h-14 w-20" />
        <div className="min-w-0 flex-1">
          <p className="truncate type-body font-medium text-foreground">{slot?.name || `素材需求 #${candidate.candidate_asset_slot_id}`}</p>
          <p className="truncate type-label text-muted-foreground">{candidate.note || sourceTypeLabel(candidate.source_type)}</p>
          {slot && !assetSlotHasLoadedResource(slot) ? (
            <p className="mt-0.5 truncate type-label text-amber-600 dark:text-amber-300">候选资源不存在或未加载，暂不能锁定。</p>
          ) : null}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Button size="sm" disabled={selected || busy || !candidate.candidate_asset_slot_id || !canLock} onClick={onConfirm}>
          {selected ? '已选定' : canLock ? '锁定此候选' : '缺资源'}
        </Button>
        <Button size="sm" variant="outline" disabled={selected || busy || !candidate.candidate_asset_slot_id} onClick={onReject}>
          拒绝
        </Button>
      </div>
    </div>
  )
}

function slotStatusLabel(status: SlotStatus): string {
  const labels: Record<SlotStatus, string> = {
    missing: '缺少',
    candidate: '待选择',
    locked: '已选定',
    waived: '不需要',
  }
  return labels[status]
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

function MiniStat({ label, value }: { label: string; value?: string | number }) {
  return <WorkbenchKeyValue label={label} value={value || '无'} />
}
