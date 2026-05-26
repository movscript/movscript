import { type DragEvent, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  Plus,
  Route,
  Play,
  Sparkles,
  X,
} from 'lucide-react'

import type { ContentGenerationMomentRow, ContentWorkbenchRecord as WorkbenchRecord } from '@/features/content/domain/contentWorkbenchModel'
import { normalizeAssetSlotStatus } from '@/features/content/domain/contentWorkbenchStatus'
import { scriptBlockCue, unitSoundCue } from '@/features/content/domain/contentWorkbenchScriptCues'
import {
  byOrder,
  firstText,
  numberOf,
  titleOfRecord,
} from '@/features/content/domain/contentWorkbenchRecordUtils'
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
} from '@/features/content/domain/contentWorkbenchTimeline'
import { buildContentWorkbenchUnitTrack, contentWorkbenchUnitRequiresKeyframe } from '@/features/content/domain/contentWorkbenchUnitTrack'
import { trackKindLabel } from '@/features/content/domain/contentWorkbenchLabels'
import { sceneIdentifier, unitIdentifier } from '@/features/content/domain/productionIdentifiers'
import { contentWorkbenchStatusRecipe } from '@/features/content/presentation/contentSemanticUi'
import type { Job } from '@/types'
import {
  Badge,
  ContentWorkbenchShotList,
  ContentWorkbenchShotListActionBar,
  ContentWorkbenchShotListCard,
  ContentWorkbenchShotListFieldButton,
  ContentWorkbenchShotListFieldGrid,
  ContentWorkbenchShotListGrid,
  ContentWorkbenchShotListHeader,
  ContentWorkbenchUnitControlBar,
  ContentWorkbenchUnitExecutionActionRow,
  ContentWorkbenchUnitExecutionCard,
  ContentWorkbenchUnitExecutionDetail,
  ContentWorkbenchUnitExecutionDetailGrid,
  ContentWorkbenchUnitExecutionGrid,
  ContentWorkbenchUnitExecutionRegion,
  ContentWorkbenchUnitExecutionStatus,
  ContentWorkbenchUnitKindFilterButton,
  ContentWorkbenchUnitKindFilterGroup,
  ContentWorkbenchUnitMoveButton,
  ContentWorkbenchUnitScheduleEmpty,
  ContentWorkbenchUnitScheduleFrame,
  ContentWorkbenchUnitScheduleHeader,
  ContentWorkbenchUnitScheduleToolbar,
  ContentWorkbenchUnitSceneBrief,
  ContentWorkbenchUnitInspectorHeader,
  ContentWorkbenchUnitInspectorShell,
  ContentWorkbenchUnitNextActionCard,
  ContentWorkbenchUnitPanelSwitcher,
  ContentWorkbenchUnitPanelTab,
  ContentWorkbenchTimelineBoundary,
  ContentWorkbenchTimelineBlock,
  ContentWorkbenchTimelineGridRow,
  ContentWorkbenchTimelineLane,
  ContentWorkbenchTimelineLaneHeader,
  ContentWorkbenchTimelineLaneMarker,
  ContentWorkbenchTimelineLaneStack,
  ContentWorkbenchTimelinePlayhead,
  ContentWorkbenchTimelineRuler,
  ContentWorkbenchTimelineStatusGroup,
  ContentWorkbenchTimelineTick,
  ContentWorkbenchTimelineViewport,
  ContentWorkbenchTimelineZoomControl,
  ContentWorkbenchUnitTrackHeader,
  ContentWorkbenchUnitTrackActionButton,
  ContentWorkbenchUnitTrackMeta,
  ContentWorkbenchUnitTrackShell,
  StatusBadge,
  WorkbenchEmptyState,
} from '@movscript/ui'
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
  onAiVisualTaskGraph,
  onCreateAssetSlot,
  onCreateKeyframe,
  onOpenCanvas,
  onUploadMissingAssets,
  onDeleteUnit,
  onClose,
}: {
  projectId?: number
  queryKey?: readonly unknown[]
  jobs?: Job[]
  row: ContentGenerationMomentRow | null
  unit: WorkbenchRecord | null
  onSelectUnit: (unitId: number) => void
  onCreateUnit: () => void
  onAiSuggest?: () => void
  onAiVisualTaskGraph?: () => void
  onCreateAssetSlot?: () => void
  onCreateKeyframe?: () => void
  onOpenCanvas?: () => void
  onUploadMissingAssets?: () => void
  onDeleteUnit?: (unit: WorkbenchRecord) => void
  onClose?: () => void
}) {
  const drawerAction = buildContentUnitDrawerAction({
    row,
    unit,
    onCreateUnit,
    onAiSuggest,
    onAiVisualTaskGraph,
    onCreateAssetSlot,
    onCreateKeyframe,
    onOpenCanvas,
  })

  return (
    <ContentWorkbenchUnitInspectorShell>
      <ContentWorkbenchUnitInspectorHeader
        icon={<FileText size={14} />}
        kicker="镜头详情"
        title={unit ? titleOfRecord(unit) : row ? '选择或规划镜头' : '等待选择情节'}
        detail={
          unit
            ? '这里只编辑选中镜头的生成目标、关键帧、故事板和调度输入。'
            : row
              ? '先在镜头方案中选择一个镜头，或让 AI 规划一组镜头。'
              : '选择情节后再开始内容编排。'
        }
        actions={(
          <>
            {unit ? <Badge variant="outline">{trackKindLabel(String(unit.kind || 'shot'))}</Badge> : null}
            {onClose ? (
              <ContentWorkbenchUnitTrackActionButton size="icon-sm" variant="ghost" onClick={onClose} aria-label="收起镜头详情抽屉">
                <X size={14} />
              </ContentWorkbenchUnitTrackActionButton>
            ) : null}
          </>
        )}
      />
      <ContentWorkbenchUnitNextActionCard
        tone={drawerAction.state}
        icon={drawerAction.state === 'ready' ? <CheckCircle2 size={15} /> : drawerAction.state === 'blocked' ? <AlertTriangle size={15} /> : <FileText size={15} />}
        label={drawerAction.label}
        detail={drawerAction.detail}
        actionText={drawerAction.actionText}
        onAction={drawerAction.onAction}
      />
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
        onAiVisualTaskGraph={onAiVisualTaskGraph}
        onCreateAssetSlot={onCreateAssetSlot}
        onCreateKeyframe={onCreateKeyframe}
        onOpenCanvas={onOpenCanvas}
        onUploadMissingAssets={onUploadMissingAssets}
        onDeleteUnit={onDeleteUnit}
      />
    </ContentWorkbenchUnitInspectorShell>
  )
}

function buildContentUnitDrawerAction({
  row,
  unit,
  onCreateUnit,
  onAiSuggest,
  onAiVisualTaskGraph,
  onCreateAssetSlot,
  onCreateKeyframe,
  onOpenCanvas,
}: {
  row: ContentGenerationMomentRow | null
  unit: WorkbenchRecord | null
  onCreateUnit: () => void
  onAiSuggest?: () => void
  onAiVisualTaskGraph?: () => void
  onCreateAssetSlot?: () => void
  onCreateKeyframe?: () => void
  onOpenCanvas?: () => void
}) {
  if (!row) {
    return {
      state: 'idle' as const,
      label: '选择情节',
      detail: '先从左侧情节导航选择一个情节，再规划它需要的镜头组合。',
      actionText: '选择情节',
    }
  }
  if (!unit) {
    return {
      state: 'blocked' as const,
      label: '规划镜头方案',
      detail: '当前情节还没有选中的镜头。先选择一个镜头，或让 AI 帮你拆分这一段情节。',
      actionText: '新建镜头',
      onAction: onCreateUnit,
    }
  }

  const unitSlots = row.assetSlots.filter((slot) => slot.owner_type === 'content_unit' && Number(slot.owner_id) === unit.ID)
  const missingSlots = unitSlots.filter((slot) => normalizeAssetSlotStatus(slot.status) === 'missing')
  const unitKeyframes = row.keyframes.filter((keyframe) => Number(keyframe.content_unit_id) === unit.ID)
  const hasPrompt = Boolean(firstText(unit.prompt, unit.description))
  const requiresKeyframe = contentWorkbenchUnitRequiresKeyframe(unit.kind)

  if (!hasPrompt) {
    return {
      state: 'blocked' as const,
      label: '补齐生成目标',
      detail: '当前镜头缺少描述或提示词，生成前需要先说明画面、声音或叙事目标。',
      actionText: onAiVisualTaskGraph ? '让 AI 起草' : '补齐输入',
      onAction: onAiVisualTaskGraph,
    }
  }
  if (missingSlots.length > 0) {
    return {
      state: 'blocked' as const,
      label: '补素材',
      detail: `${missingSlots.length} 个素材缺口需要补齐。先上传或绑定候选素材。`,
      actionText: '补素材',
      onAction: onCreateAssetSlot,
    }
  }
  if (requiresKeyframe && unitKeyframes.length === 0) {
    return {
      state: 'blocked' as const,
      label: '建立关键画面',
      detail: '镜头条目需要至少一个关键帧作为视频生成的画面锚点。',
      actionText: '新建关键帧',
      onAction: onCreateKeyframe,
    }
  }

  return {
    state: 'ready' as const,
    label: '开始生成视频',
    detail: '当前镜头的核心输入已经具备，可以进入生成画布检查并发起视频生成。',
    actionText: '生成画布',
    onAction: onOpenCanvas,
  }
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
      <ContentWorkbenchUnitTrackShell>
        <ContentWorkbenchUnitTrackHeader
          icon={<Route size={14} />}
          title={summary.title}
          detail={summary.detail}
          aside={<Badge variant="outline">{row ? '待镜头方案' : '待情节'}</Badge>}
        />
        <ContentWorkbenchUnitScheduleFrame
          header={(
            <ContentWorkbenchUnitScheduleHeader
              icon={<Clock3 size={14} />}
              title="镜头方案"
              badge={<Badge variant="outline">等待输入</Badge>}
            />
          )}
        >
          <ContentWorkbenchUnitScheduleEmpty
            title={row ? '当前情节还没有镜头方案' : '先选择一个情节'}
            detail={
              row
                ? '先把情节拆成一组镜头，再逐个补齐时间位置、对白/声音、关键帧和素材缺口。'
                : '选择情节后，这里会显示该情节的镜头方案和右侧可编辑详情。'
            }
            actions={row ? (
              <>
                {onAiSuggest ? (
                  <ContentWorkbenchUnitTrackActionButton onClick={onAiSuggest}>
                    <Sparkles size={14} />
                    AI 规划镜头方案
                  </ContentWorkbenchUnitTrackActionButton>
                ) : null}
                <ContentWorkbenchUnitTrackActionButton variant="outline" onClick={onCreateUnit}>
                  <Plus size={14} />
                  手动添加镜头
                </ContentWorkbenchUnitTrackActionButton>
              </>
            ) : (
              <ContentWorkbenchUnitTrackActionButton variant="outline" onClick={onSelectFirstMoment}>
                <Route size={14} />
                选择第一个情节
              </ContentWorkbenchUnitTrackActionButton>
            )}
          />
        </ContentWorkbenchUnitScheduleFrame>
      </ContentWorkbenchUnitTrackShell>
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
  const sceneIntentText = row ? firstText(row.moment.description, row.moment.content, row.moment.prompt, row.title) : ''
  const scenePlanMeta = row
    ? [
        `${summary.items.length} 个镜头`,
        row.references.length > 0 ? `${row.references.length} 个设定` : '',
        row.scriptBlocks.length > 0 ? `${row.scriptBlocks.length} 条内容` : '',
        summary.blockedCount > 0 ? `${summary.blockedCount} 个待补齐` : `${summary.readyCount} 个可生成`,
      ].filter(Boolean)
    : []
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
      detail: kind === 'shot' ? '镜头 · 关键帧挂载' : '制作条目',
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
    <ContentWorkbenchUnitTrackShell>
      <ContentWorkbenchUnitTrackHeader
        icon={<Route size={14} />}
        title={summary.title}
        detail={summary.detail}
        aside={(
          <ContentWorkbenchUnitTrackMeta
            items={[
              { label: `${summary.total} 镜头` },
              { label: formatTrackDuration(summary.durationSec) },
              { label: `${summary.keyframeCount} 关键帧`, tone: summary.keyframeCount > 0 ? 'neutral' : 'warning' },
            ]}
          />
        )}
      />

      <ContentWorkbenchUnitControlBar
        filters={(
          <ContentWorkbenchUnitKindFilterGroup>
            <ContentWorkbenchUnitKindFilterButton active={unitKindFilter === 'all'} onClick={() => setUnitKindFilter('all')}>
              全部 {summary.items.length}
            </ContentWorkbenchUnitKindFilterButton>
            {unitKindOptions.map((option) => (
              <ContentWorkbenchUnitKindFilterButton
                key={option.kind}
                active={unitKindFilter === option.kind}
                onClick={() => setUnitKindFilter(option.kind)}
              >
                {option.label} {option.count}
              </ContentWorkbenchUnitKindFilterButton>
            ))}
          </ContentWorkbenchUnitKindFilterGroup>
        )}
        actions={(
          <>
            {onAiSuggest ? (
              <ContentWorkbenchUnitTrackActionButton onClick={onAiSuggest} data-testid="content-workbench-ai-shot-taskGraph">
                <Sparkles size={14} />
                AI 规划镜头方案
              </ContentWorkbenchUnitTrackActionButton>
            ) : null}
            <ContentWorkbenchUnitTrackActionButton variant="outline" onClick={onCreateUnit} data-testid="content-workbench-create-unit-from-track">
              <Plus size={14} />
              手动添加镜头
            </ContentWorkbenchUnitTrackActionButton>
          </>
        )}
      />

      <ContentWorkbenchUnitSceneBrief
        title="情节表达目标"
        detail={sceneIntentText || '这个情节还缺少可用于拆分镜头的描述。'}
        badges={scenePlanMeta.map((item) => (
          <Badge key={item} variant="outline">{item}</Badge>
        ))}
      />

      <ContentWorkbenchUnitExecutionRegion>
        {visibleSummary.items.length > 0 ? (
          <ContentWorkbenchUnitExecutionGrid>
              {visibleSummary.items.map((item, index) => {
                const previousItem = visibleSummary.items[index - 1]
                const nextItem = visibleSummary.items[index + 1]
                const itemAction = contentWorkbenchUnitExecutionAction(item)
                const purposeText = contentWorkbenchUnitNarrativePurpose(item)
                return (
                  <ContentWorkbenchUnitExecutionCard
                    key={item.id}
                    active={item.selected}
                    draggable={canDragUnits}
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
                    onClick={() => selectOrClearUnit(Number(item.id))}
                    identifier={item.identifier || String(index + 1).padStart(2, '0')}
                    heading={item.title}
                    summary={`${trackKindLabel(item.kind)} · ${item.summary || item.scriptCue || item.soundCue || '待补画面描述'}`}
                    status={(
                      <ContentWorkbenchUnitExecutionStatus
                        tone={itemAction.state === 'ready' ? 'ready' : 'blocked'}
                        icon={itemAction.state === 'ready' ? <Play size={12} /> : <AlertTriangle size={12} />}
                      >
                        {itemAction.label}
                      </ContentWorkbenchUnitExecutionStatus>
                    )}
                    details={(
                      <ContentWorkbenchUnitExecutionDetailGrid>
                        <ContentWorkbenchUnitExecutionDetail
                          label="画面目标"
                          value={item.summary || item.scriptCue || item.soundCue || '待补画面描述'}
                          meta={trackKindLabel(item.kind)}
                        />
                        <ContentWorkbenchUnitExecutionDetail
                          label="承载作用"
                          value={purposeText.title}
                          meta={purposeText.detail}
                        />
                        <ContentWorkbenchUnitExecutionDetail
                          label="下一步"
                          value={formatTrackTimeRange(contentWorkbenchLocalTimelineSec(item.startSec, timelineOriginSec), contentWorkbenchLocalTimelineSec(item.endSec, timelineOriginSec), item.durationSec)}
                          meta={itemAction.detail}
                        />
                      </ContentWorkbenchUnitExecutionDetailGrid>
                    )}
                    actions={canDragUnits ? (
                      <ContentWorkbenchUnitExecutionActionRow>
                        <ContentWorkbenchUnitMoveButton
                          data-testid="content-workbench-unit-move-earlier"
                          aria-label={`前移 ${item.title}`}
                          title="前移"
                          disabled={!previousItem || isReordering}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (!previousItem) return
                            onReorderUnit(Number(item.id), Number(previousItem.id), 'before')
                          }}
                        >
                          <ArrowLeft size={12} />
                        </ContentWorkbenchUnitMoveButton>
                        <ContentWorkbenchUnitMoveButton
                          data-testid="content-workbench-unit-move-later"
                          aria-label={`后移 ${item.title}`}
                          title="后移"
                          disabled={!nextItem || isReordering}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (!nextItem) return
                            onReorderUnit(Number(item.id), Number(nextItem.id), 'after')
                          }}
                        >
                          <ArrowRight size={12} />
                        </ContentWorkbenchUnitMoveButton>
                      </ContentWorkbenchUnitExecutionActionRow>
                    ) : null}
                  />
                )
              })}
          </ContentWorkbenchUnitExecutionGrid>
        ) : (
          <WorkbenchEmptyState compact title="当前类型下没有镜头。" />
        )}
      </ContentWorkbenchUnitExecutionRegion>

      <ContentWorkbenchUnitScheduleFrame
        header={(
          <ContentWorkbenchUnitScheduleToolbar
            switcher={(
              <ContentWorkbenchUnitPanelSwitcher>
                <ContentWorkbenchUnitPanelTab active={schedulePanel === 'timeline'} onClick={() => setSchedulePanel('timeline')}>
                  <Clock3 size={14} />
                  方案时间轴
                </ContentWorkbenchUnitPanelTab>
                {selectedUnit && showInlineEditor ? (
                  <ContentWorkbenchUnitPanelTab active={schedulePanel === 'edit'} onClick={() => setSchedulePanel('edit')}>
                    <FileText size={14} />
                    镜头编辑
                  </ContentWorkbenchUnitPanelTab>
                ) : null}
              </ContentWorkbenchUnitPanelSwitcher>
            )}
            controls={(
              <ContentWorkbenchTimelineStatusGroup>
                {schedulePanel === 'timeline' ? (
                  <>
                    <ContentWorkbenchTimelineZoomControl
                      value={`${Math.round(timelineZoom * 100)}%`}
                      onZoomOut={() => setTimelineZoom((value) => Math.max(0.05, Math.round((value / 1.25) * 1000) / 1000))}
                      onZoomIn={() => setTimelineZoom((value) => Math.round((value * 1.25) * 1000) / 1000)}
                      onReset={() => setTimelineZoom(1)}
                    />
                    {selectedTimelineItem ? (
                      <Badge data-testid="content-workbench-timeline-playhead-label">播放头 {formatTrackClock(selectedTimelineItemStartSec)}</Badge>
                    ) : null}
                    {focusedTimeline ? (
                      <Badge variant="outline" data-testid="content-workbench-timeline-focus-label">关注段 0:00 = 全局 {formatTrackClock(timelineOriginSec)}</Badge>
                    ) : null}
                  </>
                ) : null}
                <Badge variant="outline">{formatTrackDuration(timelineContentDurationSec)}</Badge>
              </ContentWorkbenchTimelineStatusGroup>
            )}
          />
        )}
      >
        {schedulePanel === 'timeline' || !showInlineEditor ? (<>
        <ContentWorkbenchTimelineViewport minWidth={timelineCanvasWidth}>
              <ContentWorkbenchTimelineGridRow label="时间尺">
                <ContentWorkbenchTimelineRuler>
                  {selectedTimelineItem ? (
                    <ContentWorkbenchTimelinePlayhead
                      left={trackTimelinePx(selectedTimelineItemStartSec, timelinePxPerSec)}
                      label={formatTrackClock(selectedTimelineItemStartSec)}
                    />
                  ) : null}
                  {timelineTicks.map((tick) => (
                    <ContentWorkbenchTimelineTick
                      key={tick.seconds}
                      left={trackTimelinePx(tick.seconds, timelinePxPerSec)}
                      label={tick.label}
                    />
                  ))}
                  {timelineBoundaries.map((boundary) => (
                    <ContentWorkbenchTimelineBoundary
                      key={`ruler-boundary-${boundary.key}`}
                      left={boundary.leftPx}
                      label={boundary.label}
                    />
                  ))}
                </ContentWorkbenchTimelineRuler>
              </ContentWorkbenchTimelineGridRow>
              <ContentWorkbenchTimelineLaneStack>
                {timelineLanes.map((lane) => (
                  <ContentWorkbenchTimelineGridRow key={lane.key} label={<ContentWorkbenchTimelineLaneHeader title={lane.label} detail={lane.detail} />}>
                    <ContentWorkbenchTimelineLane
                      laneKind={lane.key}
                      onDragOver={(event) => {
                        if (!canDragUnits) return
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                      }}
                      onDrop={(event) => handleTimelineLaneDrop(event)}
                    >
                      {selectedTimelineItem ? (
                        <ContentWorkbenchTimelineLaneMarker variant="playhead" left={trackTimelinePx(selectedTimelineItemStartSec, timelinePxPerSec)} />
                      ) : null}
                      {timelineTicks.map((tick) => (
                        <ContentWorkbenchTimelineLaneMarker
                          key={`${lane.key}-${tick.seconds}`}
                          left={trackTimelinePx(tick.seconds, timelinePxPerSec)}
                        />
                      ))}
                      {timelineBoundaries.map((boundary) => (
                        <ContentWorkbenchTimelineLaneMarker
                          key={`${lane.key}-boundary-${boundary.key}`}
                          variant="boundary"
                          left={boundary.leftPx}
                        />
                      ))}
                      {lane.items.map(({ item, title, detail, muted }) => (
                        <ContentWorkbenchTimelineBlock
                          key={`${lane.key}-${item.id}`}
                          active={item.selected}
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
                          left={trackTimelinePx(contentWorkbenchLocalTimelineSec(item.startSec, timelineOriginSec), timelinePxPerSec)}
                          width={trackTimelineWidthPx(item.durationSec, timelinePxPerSec)}
                          blockTitle={title}
                          detail={detail}
                          tone={item.state === 'blocked' && !item.selected ? 'blocked' : 'default'}
                          muted={muted}
                        />
                      ))}
                    </ContentWorkbenchTimelineLane>
                  </ContentWorkbenchTimelineGridRow>
                ))}
              </ContentWorkbenchTimelineLaneStack>
        </ContentWorkbenchTimelineViewport>
        <ContentWorkbenchShotList
          title="镜头明细"
          badge={<Badge variant="outline">{visibleSummary.items.length} 项</Badge>}
        >
          <ContentWorkbenchShotListGrid>
            {visibleSummary.items.map((item, index) => {
              const previousItem = visibleSummary.items[index - 1]
              const nextItem = visibleSummary.items[index + 1]
              return (
                <ContentWorkbenchShotListCard
                  key={item.id}
                  active={item.selected}
                  data-track-item-id={item.id}
                  actions={canDragUnits ? (
                    <ContentWorkbenchShotListActionBar>
                      <ContentWorkbenchUnitMoveButton
                        data-testid="content-workbench-shot-list-move-earlier"
                        aria-label={`前移 ${item.title}`}
                        title="前移"
                        disabled={!previousItem || isReordering}
                        onClick={() => {
                          if (!previousItem) return
                          onReorderUnit(Number(item.id), Number(previousItem.id), 'before')
                        }}
                      >
                        <ArrowLeft size={12} />
                      </ContentWorkbenchUnitMoveButton>
                      <ContentWorkbenchUnitMoveButton
                        data-testid="content-workbench-shot-list-move-later"
                        aria-label={`后移 ${item.title}`}
                        title="后移"
                        disabled={!nextItem || isReordering}
                        onClick={() => {
                          if (!nextItem) return
                          onReorderUnit(Number(item.id), Number(nextItem.id), 'after')
                        }}
                      >
                        <ArrowRight size={12} />
                      </ContentWorkbenchUnitMoveButton>
                    </ContentWorkbenchShotListActionBar>
                  ) : null}
                >
                  <ContentWorkbenchShotListHeader
                    identifier={String(index + 1).padStart(2, '0')}
                    title={item.title}
                    summary={item.summary || item.scriptCue || item.soundCue || '待补输入'}
                    onOpen={() => selectOrClearUnit(Number(item.id))}
                    status={(
                      <StatusBadge {...contentWorkbenchStatusRecipe(item.state)}>{item.state === 'blocked' ? '待补齐' : item.state === 'ready' ? '可生成' : '处理中'}</StatusBadge>
                    )}
                  />
                  <ContentWorkbenchShotListFieldGrid>
                    <ContentWorkbenchShotListFieldButton
                      label={trackKindLabel(item.kind)}
                      value={formatTrackTimeRange(contentWorkbenchLocalTimelineSec(item.startSec, timelineOriginSec), contentWorkbenchLocalTimelineSec(item.endSec, timelineOriginSec), item.durationSec)}
                      onClick={() => selectOrClearUnit(Number(item.id))}
                    />
                    <ContentWorkbenchShotListFieldButton
                      label="关键帧"
                      value={item.requiresKeyframe
                        ? item.keyframeTitles.length > 0 ? item.keyframeTitles.slice(0, 2).join('、') : '未设置'
                        : '非必需'}
                      fieldTone={item.requiresKeyframe && item.keyframeTitles.length === 0 ? 'warning' : 'neutral'}
                      onClick={() => selectOrClearUnit(Number(item.id))}
                    />
                    <ContentWorkbenchShotListFieldButton
                      label="素材"
                      value={item.missingAssetTitles.length > 0 ? item.missingAssetTitles.slice(0, 2).join('、') : '无显性缺口'}
                      fieldTone={item.missingAssetTitles.length > 0 ? 'warning' : 'neutral'}
                      wide
                      onClick={() => selectOrClearUnit(Number(item.id))}
                    />
                  </ContentWorkbenchShotListFieldGrid>
                </ContentWorkbenchShotListCard>
              )
            })}
          </ContentWorkbenchShotListGrid>
        </ContentWorkbenchShotList>
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
      </ContentWorkbenchUnitScheduleFrame>
    </ContentWorkbenchUnitTrackShell>
  )
}

function formatTrackDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '未设时长'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`
}

function contentWorkbenchUnitExecutionAction(item: {
  state: string
  blockers: string[]
}) {
  if (item.blockers.includes('缺提示')) {
    return {
      state: 'blocked' as const,
      label: '补生成目标',
      detail: '先补清画面、声音或叙事意图',
    }
  }
  if (item.blockers.includes('缺素材')) {
    return {
      state: 'blocked' as const,
      label: '补素材',
      detail: '上传或绑定可用素材',
    }
  }
  if (item.blockers.includes('缺关键帧')) {
    return {
      state: 'blocked' as const,
      label: '建关键帧',
      detail: '为镜头建立画面锚点',
    }
  }
  if (item.state === 'ready') {
    return {
      state: 'ready' as const,
      label: '开始生成',
      detail: '打开抽屉进入生成画布',
    }
  }
  if (item.state === 'running') {
    return {
      state: 'ready' as const,
      label: '查看结果',
      detail: '检查生成任务和预览结果',
    }
  }
  return {
    state: 'blocked' as const,
    label: '确认输入',
    detail: '打开抽屉检查条目内容',
  }
}

function contentWorkbenchUnitNarrativePurpose(item: {
  kind: string
  scriptCue: string
  soundCue: string
  keyframeTitles: string[]
  missingAssetTitles: string[]
  labels: string[]
}) {
  if (item.scriptCue) {
    return {
      title: '承接内容条目',
      detail: item.scriptCue,
    }
  }
  if (item.soundCue) {
    return {
      title: '承接声音设计',
      detail: item.soundCue,
    }
  }
  if (item.keyframeTitles.length > 0) {
    return {
      title: '锚定关键画面',
      detail: item.keyframeTitles.slice(0, 2).join('、'),
    }
  }
  if (item.missingAssetTitles.length > 0) {
    return {
      title: '等待素材补齐',
      detail: item.missingAssetTitles.slice(0, 2).join('、'),
    }
  }
  return {
    title: item.kind === 'shot' ? '补全镜头作用' : '补全制作作用',
    detail: item.labels.join(' · '),
  }
}
