import { type DragEvent, useEffect, useState } from 'react'
import {
  Clock3,
  FileText,
  Plus,
  Route,
  Sparkles,
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
import { unitIdentifier } from '@/features/content/domain/productionIdentifiers'
import type { Job } from '@/types'
import {
  Badge,
  ContentWorkbenchUnitControlBar,
  ContentWorkbenchUnitExecutionGrid,
  ContentWorkbenchUnitExecutionRegion,
  ContentWorkbenchUnitKindFilterButton,
  ContentWorkbenchUnitKindFilterGroup,
  ContentWorkbenchUnitScheduleEmpty,
  ContentWorkbenchUnitScheduleFrame,
  ContentWorkbenchUnitScheduleHeader,
  ContentWorkbenchUnitScheduleToolbar,
  ContentWorkbenchUnitSceneBrief,
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
  ContentWorkbenchUnitTrackActionButton,
  ContentWorkbenchUnitTrackMeta,
  ContentWorkbenchUnitTrackShell,
  WorkbenchEmptyState,
} from '@movscript/ui'
import { CompactShotListCard } from './CompactShotListCard'
import { ContentUnitEditCards } from './ContentUnitEditCards'

export function UnitProductionTrack({
  row,
  selectedUnitId,
  showInlineEditor = true,
  showSceneBrief = true,
  onSelectUnit,
  onCreateUnit,
  onOpenUnitEditor,
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
  showSceneBrief?: boolean
  onSelectUnit: (unitId: number | null) => void
  onCreateUnit: () => void
  onOpenUnitEditor?: (unitId: number) => void
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
        <ContentWorkbenchUnitScheduleFrame
          header={(
            <ContentWorkbenchUnitScheduleHeader
              icon={<Clock3 size={14} />}
              title="内容方案"
              badge={<Badge variant="outline">等待输入</Badge>}
            />
          )}
        >
          <ContentWorkbenchUnitScheduleEmpty
            title={row ? '当前情节还没有内容方案' : '先选择一个情节'}
            detail={
              row
                ? '先把情节拆成一组内容条目，再逐个补齐时间位置、对白/声音、关键帧和素材缺口。'
                : '选择情节后，这里会显示该情节的内容方案和右侧可编辑详情。'
            }
            actions={row ? (
              <>
                {onAiSuggest ? (
                  <ContentWorkbenchUnitTrackActionButton onClick={onAiSuggest}>
                    <Sparkles size={14} />
                    AI 规划内容方案
                  </ContentWorkbenchUnitTrackActionButton>
                ) : null}
                <ContentWorkbenchUnitTrackActionButton variant="outline" onClick={onCreateUnit}>
                  <Plus size={14} />
                  手动添加条目
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
  const canDragTimelineItems = Boolean(row && timelineMemberItems.length > 0 && !isReordering)
  const sceneIntentText = row ? firstText(row.moment.description, row.moment.content, row.moment.prompt, row.title) : ''
  const scenePlanMeta = row
    ? [
        `${summary.items.length} 个条目`,
        row.references.length > 0 ? `${row.references.length} 个设定` : '',
        row.scriptBlocks.length > 0 ? `${row.scriptBlocks.length} 条内容` : '',
        summary.blockedCount > 0 ? `${summary.blockedCount} 个待补齐` : `${summary.readyCount} 个可生成`,
      ].filter(Boolean)
    : []
  useEffect(() => {
    if ((!selectedUnit || !showInlineEditor) && schedulePanel === 'edit') setSchedulePanel('timeline')
  }, [schedulePanel, selectedUnit, showInlineEditor])
  function selectUnit(unitId: number) {
    onSelectUnit(unitId)
  }
  function handleUnitDragStart(event: DragEvent<HTMLElement>, unitId: number, source: 'card' | 'timeline' = 'card') {
    if (!canDragTimelineItems || source !== 'timeline') return
    setDraggedUnitId(unitId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-movscript-content-unit-id', String(unitId))
    const item = visibleSummary.items.find((entry) => Number(entry.id) === unitId)
    const box = event.currentTarget.getBoundingClientRect()
    const pointerRatio = box.width > 0 ? Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) : 0
    const offsetSec = source === 'timeline' && item ? pointerRatio * item.durationSec : 0
    event.dataTransfer.setData('application/x-movscript-timeline-drag-offset-sec', String(offsetSec))
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
          title: item.title,
          detail: kind === 'shot' ? [sceneText, keyframeText, gapText].filter(Boolean).join(' · ') : firstText(sceneText, item.scriptCue, item.soundCue, item.summary, gapText),
          muted: kind === 'shot' ? item.requiresKeyframe && item.keyframeTitles.length === 0 : !item.scriptCue && !item.soundCue && !item.summary,
        }
      }),
    }
  })

  return (
    <ContentWorkbenchUnitTrackShell>
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
            <ContentWorkbenchUnitTrackMeta
              items={[
                { label: `${summary.total} 条目` },
                { label: formatTrackDuration(summary.durationSec) },
                { label: `${summary.keyframeCount} 关键帧`, tone: summary.keyframeCount > 0 ? 'neutral' : 'warning' },
              ]}
            />
            {onAiSuggest ? (
              <ContentWorkbenchUnitTrackActionButton onClick={onAiSuggest} data-testid="content-workbench-ai-shot-taskGraph">
                <Sparkles size={14} />
                AI 规划内容方案
              </ContentWorkbenchUnitTrackActionButton>
            ) : null}
            <ContentWorkbenchUnitTrackActionButton variant="outline" onClick={onCreateUnit} data-testid="content-workbench-create-unit-from-track">
              <Plus size={14} />
              手动添加条目
            </ContentWorkbenchUnitTrackActionButton>
          </>
        )}
      />

      {showSceneBrief ? (
        <ContentWorkbenchUnitSceneBrief
          title="情节表达目标"
          detail={sceneIntentText || '这个情节还缺少可用于拆分内容条目的描述。'}
          badges={scenePlanMeta.map((item) => (
            <Badge key={item} variant="outline">{item}</Badge>
          ))}
        />
      ) : null}

      <ContentWorkbenchUnitExecutionRegion>
        {visibleSummary.items.length > 0 ? (
          <ContentWorkbenchUnitExecutionGrid>
              {visibleSummary.items.map((item) => {
                return (
                  <CompactShotListCard
                    key={item.id}
                    active={item.selected}
                    data-track-item-id={item.id}
                    kind={trackKindLabel(item.kind)}
                    title={item.title}
                    frameCount={item.keyframeTitles.length}
                    expression={shotExpressionText(item)}
                    cue={shotCueText(item)}
                    status={shotStatusText(item)}
                    context={shotMetaText(item)}
                    onOpen={() => selectUnit(Number(item.id))}
                    onEdit={onOpenUnitEditor ? () => onOpenUnitEditor(Number(item.id)) : undefined}
                  />
                )
              })}
          </ContentWorkbenchUnitExecutionGrid>
        ) : (
          <WorkbenchEmptyState compact title="当前类型下没有条目。" />
        )}
      </ContentWorkbenchUnitExecutionRegion>

      <ContentWorkbenchUnitScheduleFrame
        header={(
          <ContentWorkbenchUnitScheduleToolbar
            switcher={(
              <div className="content-workbench-unit-schedule-toolbar__title">
                {schedulePanel === 'edit' ? (
                  <FileText size={14} />
                ) : (
                  <Clock3 size={14} />
                )}
                {schedulePanel === 'edit' ? '内容编辑' : '方案时间轴'}
              </div>
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
                    {selectedUnit && showInlineEditor ? (
                      <ContentWorkbenchUnitTrackActionButton
                        size="xs"
                        variant="outline"
                        onClick={() => setSchedulePanel('edit')}
                      >
                        <FileText size={14} />
                        内容编辑
                      </ContentWorkbenchUnitTrackActionButton>
                    ) : null}
                  </>
                ) : (
                  <ContentWorkbenchUnitTrackActionButton
                    size="xs"
                    variant="outline"
                    onClick={() => setSchedulePanel('timeline')}
                  >
                    <Clock3 size={14} />
                    方案时间轴
                  </ContentWorkbenchUnitTrackActionButton>
                )}
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
                        if (!canDragTimelineItems) return
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
                          draggable={canDragTimelineItems}
                          aria-grabbed={draggedUnitId === Number(item.id)}
                          title={canDragTimelineItems ? '拖动到时间轴空白处调整开始时间' : undefined}
                          onDragStart={(event) => handleUnitDragStart(event, Number(item.id), 'timeline')}
                          onDragOver={(event) => {
                            if (!canDragTimelineItems) return
                            event.preventDefault()
                            event.dataTransfer.dropEffect = 'move'
                          }}
                          onDragEnd={() => setDraggedUnitId(null)}
                          onClick={() => selectUnit(Number(item.id))}
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

function shotExpressionText(item: ReturnType<typeof buildContentWorkbenchUnitTrack>['items'][number]) {
  return firstText(item.summary, item.scriptCue, item.soundCue, item.keyframeTitles[0], '未填写镜头表达')
}

function shotCueText(item: ReturnType<typeof buildContentWorkbenchUnitTrack>['items'][number]) {
  const cue = firstText(item.scriptCue, item.soundCue, item.missingAssetTitles[0] ? `待补素材：${item.missingAssetTitles[0]}` : '')
  return cue || undefined
}

function shotStatusText(item: ReturnType<typeof buildContentWorkbenchUnitTrack>['items'][number]) {
  if (item.blockers.length > 0) return item.blockers.join(' / ')
  if (item.state === 'ready') return '可生成'
  if (item.state === 'running') return '生成中'
  return '待确认'
}

function shotMetaText(item: ReturnType<typeof buildContentWorkbenchUnitTrack>['items'][number]) {
  return [
    item.durationSec > 0 ? formatTrackDuration(item.durationSec) : '未设时长',
    item.requiresKeyframe ? `${item.keyframeTitles.length} 帧` : '无需关键帧',
    item.missingAssetTitles.length > 0 ? `${item.missingAssetTitles.length} 素材缺口` : '',
  ].filter(Boolean).join(' · ')
}
