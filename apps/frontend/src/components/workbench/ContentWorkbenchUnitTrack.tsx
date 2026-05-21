import { type DragEvent, useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  FileText,
  Plus,
  Route,
  Sparkles,
} from 'lucide-react'

import type { ContentGenerationMomentRow, ContentWorkbenchRecord as WorkbenchRecord } from '@/lib/contentWorkbenchModel'
import { normalizeAssetSlotStatus } from '@/lib/contentWorkbenchStatus'
import { scriptBlockCue, unitSoundCue } from '@/lib/contentWorkbenchScriptCues'
import {
  byOrder,
  firstText,
  numberOf,
  titleOfRecord,
} from '@/lib/contentWorkbenchRecordUtils'
import {
  buildContentWorkbenchTimelineBoundaries,
  buildTrackTimeTicks,
  contentUnitTimelineKindRank,
  contentWorkbenchLocalTimelineSec,
  contentWorkbenchTimelineOriginSec,
  contentWorkbenchTimelinePxPerSec,
  contentWorkbenchTimelineRulerWidth,
  formatTrackClock,
  formatTrackTimeRange,
  pickPreviewTimelineItemForUnit,
  snapContentWorkbenchTimelineStartSec,
  trackTimelinePx,
  trackTimelineWidthPx,
  type ContentWorkbenchDropPosition,
} from '@/lib/contentWorkbenchTimeline'
import { buildContentWorkbenchUnitTrack, contentWorkbenchUnitRequiresKeyframe } from '@/lib/contentWorkbenchUnitTrack'
import { trackKindLabel } from '@/lib/contentWorkbenchLabels'
import { sceneIdentifier, unitIdentifier } from '@/lib/productionIdentifiers'
import { cn } from '@/lib/utils'
import type { Job } from '@/types'
import { Badge, Button } from '@movscript/ui'
import { ContentUnitEditCards } from './ContentUnitEditCards'

export function ContentWorkbenchUnitInspector({
  projectId,
  queryKey,
  jobs = [],
  row,
  unit,
  onSelectUnit,
  onCreateUnit,
  onAiSuggest,
  onAiVisualPlan,
  onCreateAssetSlot,
  onCreateKeyframe,
  onOpenCanvas,
  onUploadMissingAssets,
  onDeleteUnit,
}: {
  projectId?: number
  queryKey?: readonly unknown[]
  jobs?: Job[]
  row: ContentGenerationMomentRow | null
  unit: WorkbenchRecord | null
  onSelectUnit: (unitId: number) => void
  onCreateUnit: () => void
  onAiSuggest?: () => void
  onAiVisualPlan?: () => void
  onCreateAssetSlot?: () => void
  onCreateKeyframe?: () => void
  onOpenCanvas?: () => void
  onUploadMissingAssets?: () => void
  onDeleteUnit?: (unit: WorkbenchRecord) => void
}) {
  return (
    <aside
      className="min-w-0 overflow-hidden rounded-lg border border-border bg-background 2xl:sticky 2xl:top-0"
      data-testid="content-workbench-unit-inspector"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border bg-muted/25 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 type-label font-medium text-muted-foreground">
            <FileText size={14} />
            当前制作项
          </div>
          <h3 className="mt-1 truncate type-body font-semibold text-foreground">
            {unit ? titleOfRecord(unit) : row ? '选择或创建制作项' : '等待选择情节'}
          </h3>
          <p className="mt-1 line-clamp-2 type-label leading-5 text-muted-foreground">
            {unit
              ? '生成目标、关键帧、故事板和调度输入都在这里补齐。'
              : row
                ? '先在时间轴选择一个制作项，或新建一个制作项。'
                : '选择情节后再开始内容编排。'}
          </p>
        </div>
        {unit ? <Badge variant="outline">{trackKindLabel(String(unit.kind || 'shot'))}</Badge> : null}
      </div>
      <ContentUnitEditCards
        projectId={projectId}
        queryKey={queryKey}
        jobs={jobs}
        row={row}
        unit={unit}
        compact
        onSelectUnit={onSelectUnit}
        onCreateUnit={onCreateUnit}
        onAiSuggest={onAiSuggest}
        onAiVisualPlan={onAiVisualPlan}
        onCreateAssetSlot={onCreateAssetSlot}
        onCreateKeyframe={onCreateKeyframe}
        onOpenCanvas={onOpenCanvas}
        onUploadMissingAssets={onUploadMissingAssets}
        onDeleteUnit={onDeleteUnit}
      />
    </aside>
  )
}

export function UnitProductionTrack({
  row,
  selectedUnitId,
  showInlineEditor = true,
  onSelectUnit,
  onCreateUnit,
  onAiSuggest,
  onSelectFirstMoment,
  onCreateAssetSlot,
  onCreateKeyframe,
  onOpenCanvas,
  onUploadMissingAssets,
  onReorderUnit,
  onMoveUnitOnTimeline,
  onDeleteUnit,
  projectId,
  queryKey,
  jobs = [],
  isReordering,
}: {
  row: ContentGenerationMomentRow | null
  selectedUnitId?: number
  showInlineEditor?: boolean
  onSelectUnit: (unitId: number | null) => void
  onCreateUnit: () => void
  onAiSuggest?: () => void
  onSelectFirstMoment: () => void
  onCreateAssetSlot?: () => void
  onCreateKeyframe?: () => void
  onOpenCanvas?: () => void
  onUploadMissingAssets?: () => void
  onReorderUnit: (draggedUnitId: number, targetUnitId: number, position: ContentWorkbenchDropPosition) => void
  onMoveUnitOnTimeline: (unitId: number, startSec: number) => void
  onDeleteUnit?: (unit: WorkbenchRecord) => void
  projectId?: number
  queryKey?: readonly unknown[]
  jobs?: Job[]
  isReordering?: boolean
}) {
  const selectedUnit = row?.units.find((unit) => unit.ID === selectedUnitId) ?? null
  const [draggedUnitId, setDraggedUnitId] = useState<number | null>(null)
  const [timelineZoom, setTimelineZoom] = useState(1)
  const [unitKindFilter, setUnitKindFilter] = useState('all')
  const [schedulePanel, setSchedulePanel] = useState<'timeline' | 'edit'>('timeline')
  const summary = buildContentWorkbenchUnitTrack((row?.units ?? []).slice().sort(byOrder).map((unit) => {
    const unitSlots = row?.assetSlots.filter((slot) => slot.owner_type === 'content_unit' && Number(slot.owner_id) === unit.ID) ?? []
    const missingSlots = unitSlots.filter((slot) => normalizeAssetSlotStatus(slot.status) === 'missing')
    const audioSlots = unitSlots.filter((slot) => slot.kind === 'audio')
    const keyframes = row?.keyframes.filter((keyframe) => Number(keyframe.content_unit_id) === unit.ID) ?? []
    const scriptBlock = row?.scriptBlocks.find((block) => block.ID === Number(unit.script_block_id)) ?? null
    const previewTimelineItem = pickPreviewTimelineItemForUnit(row?.previewTimelineItems ?? [], unit.ID)
    return {
      id: unit.ID,
      title: titleOfRecord(unit),
      kind: unit.kind,
      identifier: unitIdentifier(unit),
      startSec: previewTimelineItem ? numberOf(previewTimelineItem.start_sec) : undefined,
      durationSec: numberOf(previewTimelineItem?.duration_sec) || numberOf(unit.duration_sec),
      status: unit.status,
      summary: firstText(unit.description, unit.prompt),
      sceneMomentTitle: firstText(unit.__scene_moment_title, row?.title),
      segmentTitle: firstText(unit.__segment_title, row?.segment ? titleOfRecord(row.segment) : ''),
      scriptCue: scriptBlockCue(scriptBlock),
      soundCue: unitSoundCue(unit, scriptBlock, audioSlots),
      keyframeTitles: keyframes.map(titleOfRecord),
      missingAssetTitles: missingSlots.map(titleOfRecord),
      requiresKeyframe: contentWorkbenchUnitRequiresKeyframe(unit.kind),
      timeSource: previewTimelineItem ? 'preview' as const : 'estimated' as const,
      hasPrompt: Boolean(firstText(unit.prompt, unit.description)),
      assetSlotCount: unitSlots.length,
      missingSlotCount: missingSlots.length,
      keyframeCount: keyframes.length,
      selected: selectedUnitId === unit.ID,
    }
  }))
  const unitKindOptions = Array.from(new Set(summary.items.map((item) => String(item.kind || 'shot'))))
    .sort((a, b) => contentUnitTimelineKindRank(a) - contentUnitTimelineKindRank(b) || trackKindLabel(a).localeCompare(trackKindLabel(b), 'zh-Hans-CN'))
    .map((kind) => ({
      kind,
      label: trackKindLabel(kind),
      count: summary.items.filter((item) => String(item.kind || 'shot') === kind).length,
    }))
  const filteredItems = unitKindFilter === 'all'
    ? summary.items
    : summary.items.filter((item) => String(item.kind || 'shot') === unitKindFilter)
  const visibleSummary = {
    ...summary,
    items: filteredItems,
    total: filteredItems.length,
    durationSec: filteredItems.reduce((max, item) => Math.max(max, item.endSec), 0),
    keyframeCount: filteredItems.reduce((sum, item) => sum + item.keyframeTitles.length, 0),
    selectedId: filteredItems.find((item) => item.selected)?.id,
  }

  if (!row || summary.total === 0) {
    return (
      <div className="rounded-md border border-border bg-background p-2.5" data-testid="content-workbench-unit-track">
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 type-body font-medium text-foreground">
              <Route size={15} className="text-muted-foreground" />
              {summary.title}
            </div>
            <p className="mt-1 type-label leading-5 text-muted-foreground">{summary.detail}</p>
          </div>
          <Badge variant="outline">{row ? '待制作项' : '待情节'}</Badge>
        </div>
        <div className="mt-3 overflow-hidden rounded-md border border-dashed border-border bg-card" data-testid="content-workbench-unit-schedule">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-2.5 py-2">
            <div className="flex min-w-0 items-center gap-2 type-body font-medium text-foreground">
              <Clock3 size={15} className="shrink-0 text-muted-foreground" />
              <span className="truncate">制作项时间表</span>
            </div>
            <Badge variant="outline">等待输入</Badge>
          </div>
          <div className="px-3 py-5 type-body text-muted-foreground">
            <p className="font-medium text-foreground">{row ? '当前情节还没有制作项' : '先选择一个情节'}</p>
            <p className="mt-1 type-label leading-5 text-muted-foreground">
              {row
                ? '添加或采纳制作项后，这里会显示时间位置、对白/声音、关键帧和素材缺口。'
                : '选择情节后，这里会显示该情节的制作项时间表和右侧可编辑卡片。'}
            </p>
            {row ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" className="gap-1.5" onClick={onCreateUnit}>
                  <Plus size={13} />
                  添加制作项
                </Button>
                {onAiSuggest ? (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={onAiSuggest}>
                    <Sparkles size={13} />
                    让 AI 规划制作项
                  </Button>
                ) : null}
              </div>
            ) : (
              <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={onSelectFirstMoment}>
                <Route size={13} />
                选择第一个情节
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const timelineMemberItems = summary.items
  const timelineOriginSec = contentWorkbenchTimelineOriginSec(timelineMemberItems)
  const timelineContentDurationSec = Math.max(1, summary.items.reduce((max, item) => Math.max(max, item.endSec - timelineOriginSec), 0))
  const timelinePxPerSec = contentWorkbenchTimelinePxPerSec(timelineZoom)
  const timelineRulerWidth = contentWorkbenchTimelineRulerWidth(timelineMemberItems, timelineOriginSec, timelinePxPerSec)
  const timelineCanvasWidth = timelineRulerWidth + 124
  const timelineDurationSec = timelineRulerWidth / timelinePxPerSec
  const timelineTicks = buildTrackTimeTicks(timelineDurationSec, timelinePxPerSec)
  const timelineBoundaries = buildContentWorkbenchTimelineBoundaries(timelineMemberItems, timelineOriginSec, timelinePxPerSec)
  const selectedTimelineItem = timelineMemberItems.find((item) => item.selected) ?? null
  const selectedTimelineItemStartSec = selectedTimelineItem ? contentWorkbenchLocalTimelineSec(selectedTimelineItem.startSec, timelineOriginSec) : 0
  const focusedTimeline = timelineOriginSec > 0
  const canDragUnits = Boolean(row && visibleSummary.total > 0 && !isReordering)
  useEffect(() => {
    if ((!selectedUnit || !showInlineEditor) && schedulePanel === 'edit') setSchedulePanel('timeline')
  }, [schedulePanel, selectedUnit, showInlineEditor])
  function selectOrClearUnit(unitId: number) {
    if (selectedUnitId === unitId) {
      onSelectUnit(null)
      return
    }
    onSelectUnit(unitId)
  }
  function handleUnitDragStart(event: DragEvent<HTMLElement>, unitId: number, source: 'card' | 'timeline' = 'card') {
    if (!canDragUnits) return
    setDraggedUnitId(unitId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-movscript-content-unit-id', String(unitId))
    const item = visibleSummary.items.find((entry) => Number(entry.id) === unitId)
    const box = event.currentTarget.getBoundingClientRect()
    const pointerRatio = box.width > 0 ? Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) : 0
    const offsetSec = source === 'timeline' && item ? pointerRatio * item.durationSec : 0
    event.dataTransfer.setData('application/x-movscript-timeline-drag-offset-sec', String(offsetSec))
  }
  function handleUnitDrop(event: DragEvent<HTMLElement>, targetUnitId: number) {
    event.preventDefault()
    event.stopPropagation()
    const rawUnitId = event.dataTransfer.getData('application/x-movscript-content-unit-id')
    const sourceUnitId = Number(rawUnitId || draggedUnitId || 0)
    setDraggedUnitId(null)
    if (!sourceUnitId || sourceUnitId === targetUnitId) return
    const box = event.currentTarget.getBoundingClientRect()
    const position: ContentWorkbenchDropPosition = event.clientX > box.left + box.width / 2 ? 'after' : 'before'
    onReorderUnit(sourceUnitId, targetUnitId, position)
  }
  function handleTimelineLaneDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    const rawUnitId = event.dataTransfer.getData('application/x-movscript-content-unit-id')
    const sourceUnitId = Number(rawUnitId || draggedUnitId || 0)
    const dragOffsetSec = Number(event.dataTransfer.getData('application/x-movscript-timeline-drag-offset-sec')) || 0
    setDraggedUnitId(null)
    if (!sourceUnitId) return
    const box = event.currentTarget.getBoundingClientRect()
    const unit = visibleSummary.items.find((item) => Number(item.id) === sourceUnitId)
    if (!unit) return
    const rawStartSec = Math.max(0, (event.clientX - box.left) / timelinePxPerSec - dragOffsetSec)
    const localStartSec = snapContentWorkbenchTimelineStartSec(rawStartSec, timelinePxPerSec, timelineMemberItems.map((item) => ({
      id: item.id,
      startSec: contentWorkbenchLocalTimelineSec(item.startSec, timelineOriginSec),
      endSec: contentWorkbenchLocalTimelineSec(item.endSec, timelineOriginSec),
    })), sourceUnitId)
    onMoveUnitOnTimeline(sourceUnitId, Math.round((localStartSec + timelineOriginSec) * 10) / 10)
  }
  const timelineKinds = Array.from(new Set(summary.items.map((item) => String(item.kind || 'shot'))))
    .sort((a, b) => contentUnitTimelineKindRank(a) - contentUnitTimelineKindRank(b) || trackKindLabel(a).localeCompare(trackKindLabel(b), 'zh-Hans-CN'))
  const timelineLanes = timelineKinds.map((kind) => {
    const laneItems = timelineMemberItems.filter((item) => String(item.kind || 'shot') === kind)
    return {
      key: kind,
      label: trackKindLabel(kind),
      detail: kind === 'shot' ? '镜头 · 关键帧挂载' : '制作项',
      rawItems: laneItems,
      items: laneItems.map((item) => {
        const keyframeText = item.requiresKeyframe
          ? item.keyframeTitles.length > 0
            ? `关键帧：${item.keyframeTitles.slice(0, 2).join('、')}`
            : '关键帧：未设置'
          : item.scriptCue || item.soundCue || item.summary || '未补内容'
        const localStartSec = contentWorkbenchLocalTimelineSec(item.startSec, timelineOriginSec)
        const gapText = item.missingAssetTitles[0] ? `缺口：${item.missingAssetTitles[0]}` : formatTrackTimeRange(localStartSec, localStartSec + item.durationSec, item.durationSec)
        const sceneText = item.sceneMomentTitle ? `情节：${item.sceneMomentTitle}` : ''
        return {
          item,
          title: `${String(item.order).padStart(2, '0')} ${item.title}`,
          detail: kind === 'shot' ? [sceneText, keyframeText, gapText].filter(Boolean).join(' · ') : firstText(sceneText, item.scriptCue, item.soundCue, item.summary, gapText),
          muted: kind === 'shot' ? item.requiresKeyframe && item.keyframeTitles.length === 0 : !item.scriptCue && !item.soundCue && !item.summary,
        }
      }),
    }
  })

  return (
    <div className="rounded-md border border-border bg-background p-2.5" data-testid="content-workbench-unit-track">
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 type-body font-medium text-foreground">
            <Route size={15} className="text-muted-foreground" />
            {summary.title}
          </div>
          <p className="mt-1 type-label leading-5 text-muted-foreground">{summary.detail}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 type-label text-muted-foreground" data-testid="content-workbench-unit-track-summary">
          <span>{summary.total} 内容单元</span>
          <span className="text-border">/</span>
          <span>{formatTrackDuration(summary.durationSec)}</span>
          <span className="text-border">/</span>
          <span className={summary.keyframeCount > 0 ? undefined : 'text-amber-700 dark:text-amber-300'}>{summary.keyframeCount} 关键帧</span>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1" data-testid="content-workbench-unit-kind-filter">
          <button
            type="button"
            className={cn(
              'h-7 rounded border px-2 type-label transition-colors',
              unitKindFilter === 'all' ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-foreground',
            )}
            onClick={() => setUnitKindFilter('all')}
          >
            全部 {summary.items.length}
          </button>
          {unitKindOptions.map((option) => (
            <button
              key={option.kind}
              type="button"
              className={cn(
                'h-7 rounded border px-2 type-label transition-colors',
                unitKindFilter === option.kind ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-foreground',
              )}
              onClick={() => setUnitKindFilter(option.kind)}
            >
              {option.label} {option.count}
            </button>
          ))}
        </div>
        <Button size="sm" className="gap-1.5" onClick={onCreateUnit} data-testid="content-workbench-create-unit-from-track">
          <Plus size={13} />
          新建
        </Button>
      </div>

      <div className="mt-2.5 pb-1">
        {visibleSummary.items.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visibleSummary.items.map((item, index) => {
            const previousItem = visibleSummary.items[index - 1]
            const nextItem = visibleSummary.items[index + 1]
            return (
            <div
              key={item.id}
              draggable={canDragUnits}
              data-testid="content-workbench-unit-card"
              data-track-item-id={item.id}
              aria-grabbed={draggedUnitId === Number(item.id)}
              title={canDragUnits ? '拖动到下方时间轴调整开始时间' : undefined}
              onDragStart={(event) => handleUnitDragStart(event, Number(item.id))}
              onDragOver={(event) => {
                if (!canDragUnits) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(event) => handleUnitDrop(event, Number(item.id))}
              onDragEnd={() => setDraggedUnitId(null)}
              className={cn(
                'min-w-0 rounded-md border px-2 py-1.5 text-left transition-colors',
                canDragUnits ? 'cursor-grab active:cursor-grabbing' : '',
                item.selected
                  ? 'border-primary/60 bg-primary/5'
                  : item.tone === 'blocked'
                    ? 'border-amber-200 bg-amber-50/60 hover:border-primary/50 hover:bg-primary/5 dark:border-amber-900/60 dark:bg-amber-950/20'
                    : 'border-border bg-card hover:border-primary/50 hover:bg-primary/5',
              )}
            >
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  onClick={() => selectOrClearUnit(Number(item.id))}
                >
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 type-tiny font-semibold text-muted-foreground">{item.identifier || String(index + 1).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1 truncate type-body font-medium text-foreground">{item.title}</span>
                </button>
                {canDragUnits ? (
                  <span className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      data-testid="content-workbench-unit-move-earlier"
                      aria-label={`前移 ${item.title}`}
                      title="前移"
                      disabled={!previousItem || isReordering}
                      onClick={() => {
                        if (!previousItem) return
                        onReorderUnit(Number(item.id), Number(previousItem.id), 'before')
                      }}
                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                    >
                      <ArrowLeft size={12} />
                    </button>
                    <button
                      type="button"
                      data-testid="content-workbench-unit-move-later"
                      aria-label={`后移 ${item.title}`}
                      title="后移"
                      disabled={!nextItem || isReordering}
                      onClick={() => {
                        if (!nextItem) return
                        onReorderUnit(Number(item.id), Number(nextItem.id), 'after')
                      }}
                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                    >
                      <ArrowRight size={12} />
                    </button>
                  </span>
                ) : null}
              </div>
              <button type="button" className="mt-1 block w-full text-left" onClick={() => selectOrClearUnit(Number(item.id))}>
                <span className="block truncate type-caption text-muted-foreground">{trackKindLabel(item.kind)} · {item.labels.slice(0, 2).join(' · ') || '待补输入'}</span>
                {item.sceneMomentTitle ? (
                  <span className="mt-1 block truncate type-caption text-muted-foreground">情节：{item.sceneMomentTitle}</span>
                ) : null}
                <span className="mt-1 block truncate type-caption text-muted-foreground">
                  {item.summary || item.scriptCue || item.soundCue || '待补输入'}
                </span>
              </button>
            </div>
            )
          })}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border px-3 py-4 text-center type-body text-muted-foreground">
            当前类型下没有内容单元。
          </div>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded-md border border-border bg-card" data-testid="content-workbench-unit-schedule">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-2.5 py-2">
          <div className="flex overflow-hidden rounded-md border border-border bg-background" data-testid="content-workbench-schedule-panel-switcher">
            <button
              type="button"
              className={cn(
                'inline-flex h-8 items-center gap-1.5 px-2.5 type-label transition-colors',
                schedulePanel === 'timeline' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground',
              )}
              onClick={() => setSchedulePanel('timeline')}
            >
              <Clock3 size={13} />
              制作项时间轴
            </button>
            {selectedUnit && showInlineEditor ? (
              <button
                type="button"
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 border-l border-border px-2.5 type-label transition-colors',
                  schedulePanel === 'edit' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground',
                )}
                onClick={() => setSchedulePanel('edit')}
              >
                <FileText size={13} />
                内容编辑
              </button>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {schedulePanel === 'timeline' ? (
              <>
                <div className="flex items-center overflow-hidden rounded-md border border-border bg-background" data-testid="content-workbench-timeline-zoom">
                  <button
                    type="button"
                    className="h-7 px-2 type-label text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                    onClick={() => setTimelineZoom((value) => Math.max(0.05, Math.round((value / 1.25) * 1000) / 1000))}
                    aria-label="缩小时间轴"
                  >
                    -
                  </button>
                  <span className="border-x border-border px-2 type-caption tabular-nums text-muted-foreground">{Math.round(timelineZoom * 100)}%</span>
                  <button
                    type="button"
                    className="h-7 px-2 type-label text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                    onClick={() => setTimelineZoom((value) => Math.round((value * 1.25) * 1000) / 1000)}
                    aria-label="放大时间轴"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="h-7 border-l border-border px-2 type-caption text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                    onClick={() => setTimelineZoom(1)}
                    aria-label="重置时间轴缩放"
                  >
                    1:1
                  </button>
                </div>
                {selectedTimelineItem ? (
                  <Badge variant="secondary" data-testid="content-workbench-timeline-playhead-label">播放头 {formatTrackClock(selectedTimelineItemStartSec)}</Badge>
                ) : null}
                {focusedTimeline ? (
                  <Badge variant="outline" data-testid="content-workbench-timeline-focus-label">关注段 0:00 = 全局 {formatTrackClock(timelineOriginSec)}</Badge>
                ) : null}
              </>
            ) : null}
            <Badge variant="outline">{formatTrackDuration(timelineContentDurationSec)}</Badge>
          </div>
        </div>
        {schedulePanel === 'timeline' || !showInlineEditor ? (<>
        <div className="overflow-x-auto">
          <div style={{ minWidth: timelineCanvasWidth }}>
            <div className="border-b border-border bg-background px-2.5 py-2.5" data-testid="content-workbench-unit-timeline">
              <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
                <div className="type-caption font-medium text-muted-foreground">时间尺</div>
                <div className="relative h-8 rounded bg-muted/40">
                  {selectedTimelineItem ? (
                    <div
                      className="absolute top-0 z-10 h-full border-l-2 border-primary"
                      data-testid="content-workbench-timeline-playhead"
                      style={{ left: trackTimelinePx(selectedTimelineItemStartSec, timelinePxPerSec) }}
                    >
                      <span className="ml-1 mt-1 block rounded bg-primary px-1 py-0.5 type-tiny leading-none text-primary-foreground shadow-sm">
                        {formatTrackClock(selectedTimelineItemStartSec)}
                      </span>
                    </div>
                  ) : null}
                  {timelineTicks.map((tick) => (
                    <div
                      key={tick.seconds}
                      className="absolute top-0 h-full border-l border-border/80 pl-1"
                      style={{ left: trackTimelinePx(tick.seconds, timelinePxPerSec) }}
                    >
                      <span className="absolute bottom-0 type-tiny leading-4 text-muted-foreground">{tick.label}</span>
                    </div>
                  ))}
                  {timelineBoundaries.map((boundary) => (
                    <div
                      key={`ruler-boundary-${boundary.key}`}
                      className="absolute top-0 h-full border-l border-dashed border-primary/50 pl-1"
                      data-testid="content-workbench-timeline-boundary"
                      style={{ left: boundary.leftPx }}
                    >
                      <span className="absolute top-0 max-w-[160px] truncate rounded bg-background/95 px-1 type-tiny leading-4 text-primary shadow-sm">
                        {boundary.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-2 space-y-1.5">
                {timelineLanes.map((lane) => (
                  <div key={lane.key} className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
                    <div className="min-w-0 rounded bg-muted/30 px-2 py-1.5">
                      <p className="truncate type-caption font-medium text-foreground">{lane.label}</p>
                      <p className="mt-0.5 truncate type-tiny text-muted-foreground">{lane.detail}</p>
                    </div>
                    <div
                      className="relative h-[46px] rounded border border-border bg-muted/20"
                      data-testid="content-workbench-timeline-lane"
                      data-lane-kind={lane.key}
                      onDragOver={(event) => {
                        if (!canDragUnits) return
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                      }}
                      onDrop={(event) => handleTimelineLaneDrop(event)}
                    >
                      {selectedTimelineItem ? (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute top-0 z-10 h-full border-l-2 border-primary/70"
                          style={{ left: trackTimelinePx(selectedTimelineItemStartSec, timelinePxPerSec) }}
                        />
                      ) : null}
                      {timelineTicks.map((tick) => (
                        <span
                          key={`${lane.key}-${tick.seconds}`}
                          className="pointer-events-none absolute top-0 h-full border-l border-border/50"
                          style={{ left: trackTimelinePx(tick.seconds, timelinePxPerSec) }}
                        />
                      ))}
                      {timelineBoundaries.map((boundary) => (
                        <span
                          key={`${lane.key}-boundary-${boundary.key}`}
                          className="pointer-events-none absolute top-0 h-full border-l border-dashed border-primary/40"
                          style={{ left: boundary.leftPx }}
                        />
                      ))}
                      {lane.items.map(({ item, title, detail, muted }) => (
                        <button
                          key={`${lane.key}-${item.id}`}
                          type="button"
                          data-testid="content-workbench-timeline-block"
                          data-lane-key={lane.key}
                          data-track-item-id={item.id}
                          draggable={canDragUnits}
                          aria-grabbed={draggedUnitId === Number(item.id)}
                          title={canDragUnits ? '拖动到时间轴空白处调整开始时间' : undefined}
                          onDragStart={(event) => handleUnitDragStart(event, Number(item.id), 'timeline')}
                          onDragOver={(event) => {
                            if (!canDragUnits) return
                            event.preventDefault()
                            event.dataTransfer.dropEffect = 'move'
                          }}
                          onDragEnd={() => setDraggedUnitId(null)}
                          onClick={() => selectOrClearUnit(Number(item.id))}
                          className={cn(
                            'absolute top-1 h-9 min-w-0 overflow-hidden rounded border px-1.5 py-1 text-left type-caption shadow-sm transition-colors hover:border-primary/60 hover:bg-primary/5',
                            canDragUnits ? 'cursor-grab active:cursor-grabbing' : '',
                            item.selected ? 'border-primary/70 bg-primary/10' : item.tone === 'blocked' ? 'border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/20' : 'border-border bg-card',
                            muted ? 'opacity-60' : '',
                          )}
                          style={{
                            left: trackTimelinePx(contentWorkbenchLocalTimelineSec(item.startSec, timelineOriginSec), timelinePxPerSec),
                            width: trackTimelineWidthPx(item.durationSec, timelinePxPerSec),
                          }}
                        >
                          <span className="block truncate font-medium text-foreground">{title}</span>
                          <span className={cn('block truncate type-tiny', item.tone === 'blocked' && !muted ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>{detail}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <details className="border-t border-border bg-background" data-testid="content-workbench-shot-list">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 type-label font-medium text-muted-foreground marker:text-muted-foreground">
            <span>镜头明细</span>
            <Badge variant="outline">{visibleSummary.items.length} 项</Badge>
          </summary>
          <div className="overflow-x-auto">
          <div className="min-w-[820px] divide-y divide-border">
            <div className="grid grid-cols-[56px_96px_minmax(220px,1fr)_150px_150px_130px] gap-2 bg-muted/30 px-2.5 py-2 type-caption font-medium text-muted-foreground">
              <span>顺序</span>
              <span>类型/时间</span>
              <span>镜头内容</span>
              <span>关键帧</span>
              <span>素材</span>
              <span>状态</span>
            </div>
            {visibleSummary.items.map((item, index) => {
              const previousItem = visibleSummary.items[index - 1]
              const nextItem = visibleSummary.items[index + 1]
              return (
                <div
                  key={item.id}
                  className={cn(
                    'grid grid-cols-[56px_96px_minmax(220px,1fr)_150px_150px_130px] gap-2 px-2.5 py-2.5 text-left type-label transition-colors',
                    item.selected ? 'bg-primary/5' : 'bg-card hover:bg-primary/5',
                  )}
                  data-testid="content-workbench-shot-list-row"
                  data-track-item-id={item.id}
                >
                  <div className="flex items-center gap-1">
                    <span className="rounded bg-muted px-1.5 py-0.5 type-tiny tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                  </div>
                  <button type="button" className="min-w-0 text-left" onClick={() => selectOrClearUnit(Number(item.id))}>
                    <span className="block truncate font-medium text-foreground">{trackKindLabel(item.kind)}</span>
                    <span className="mt-0.5 block truncate type-caption text-muted-foreground">{formatTrackTimeRange(contentWorkbenchLocalTimelineSec(item.startSec, timelineOriginSec), contentWorkbenchLocalTimelineSec(item.endSec, timelineOriginSec), item.durationSec)}</span>
                  </button>
                  <button type="button" className="min-w-0 text-left" onClick={() => selectOrClearUnit(Number(item.id))}>
                    <span className="block truncate font-medium text-foreground">{item.title}</span>
                    <span className="mt-0.5 block truncate type-caption text-muted-foreground">{item.summary || item.scriptCue || item.soundCue || '待补输入'}</span>
                  </button>
                  <button type="button" className="min-w-0 text-left" onClick={() => selectOrClearUnit(Number(item.id))}>
                    <span className={cn('block truncate type-caption', item.requiresKeyframe && item.keyframeTitles.length === 0 ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
                      {item.requiresKeyframe
                        ? item.keyframeTitles.length > 0 ? item.keyframeTitles.slice(0, 2).join('、') : '未设置'
                        : '非必需'}
                    </span>
                  </button>
                  <button type="button" className="min-w-0 text-left" onClick={() => selectOrClearUnit(Number(item.id))}>
                    <span className={cn('block truncate type-caption', item.missingAssetTitles.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
                      {item.missingAssetTitles.length > 0 ? item.missingAssetTitles.slice(0, 2).join('、') : '无显性缺口'}
                    </span>
                  </button>
                  <div className="flex min-w-0 items-center justify-between gap-1.5">
                    <Badge variant={item.tone === 'blocked' ? 'warning' : item.tone === 'ready' ? 'success' : 'outline'}>{item.tone === 'blocked' ? '待补齐' : item.tone === 'ready' ? '可生成' : '处理中'}</Badge>
                    {canDragUnits ? (
                      <span className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          data-testid="content-workbench-shot-list-move-earlier"
                          aria-label={`前移 ${item.title}`}
                          title="前移"
                          disabled={!previousItem || isReordering}
                          onClick={() => {
                            if (!previousItem) return
                            onReorderUnit(Number(item.id), Number(previousItem.id), 'before')
                          }}
                          className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                        >
                          <ArrowLeft size={12} />
                        </button>
                        <button
                          type="button"
                          data-testid="content-workbench-shot-list-move-later"
                          aria-label={`后移 ${item.title}`}
                          title="后移"
                          disabled={!nextItem || isReordering}
                          onClick={() => {
                            if (!nextItem) return
                            onReorderUnit(Number(item.id), Number(nextItem.id), 'after')
                          }}
                          className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                        >
                          <ArrowRight size={12} />
                        </button>
                      </span>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
          </div>
        </details>
        </>) : (
        <ContentUnitEditCards
          projectId={projectId}
          queryKey={queryKey}
          jobs={jobs}
          row={row}
          unit={selectedUnit}
          onSelectUnit={onSelectUnit}
          onCreateUnit={onCreateUnit}
          onAiSuggest={onAiSuggest}
          onCreateAssetSlot={onCreateAssetSlot}
          onCreateKeyframe={onCreateKeyframe}
          onOpenCanvas={onOpenCanvas}
          onUploadMissingAssets={onUploadMissingAssets}
          onDeleteUnit={onDeleteUnit}
        />
        )}
      </div>
    </div>
  )
}

function formatTrackDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '未设时长'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`
}
