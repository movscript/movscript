import { type DragEvent, useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Clock3,
  Edit3,
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
  ContentWorkbenchUnitInspectorHeader,
  ContentWorkbenchUnitInspectorShell,
  ContentWorkbenchUnitNextActionCard,
  ContentWorkbenchUnitPanelSwitcher,
  ContentWorkbenchUnitPanelTab,
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
  ContentWorkbenchUnitTrackHeader,
  ContentWorkbenchUnitTrackMeta,
  ContentWorkbenchUnitTrackShell,
  StatusBadge,
  WorkbenchEmptyState,
} from '@movscript/ui'
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
              badge={<StatusBadge {...contentWorkbenchStatusRecipe('blocked')}>等待输入</StatusBadge>}
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
  function selectOrClearUnit(unitId: number) {
    onSelectUnit(selectedUnitId === unitId ? null : unitId)
  }
  function moveUnitInList(unitId: number, direction: 'earlier' | 'later') {
    const index = visibleSummary.items.findIndex((item) => Number(item.id) === unitId)
    const target = direction === 'earlier'
      ? visibleSummary.items[index - 1]
      : visibleSummary.items[index + 1]
    if (!target) return
    onReorderUnit(unitId, Number(target.id), direction === 'earlier' ? 'before' : 'after')
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
      <ContentWorkbenchUnitTrackHeader
        icon={<Route size={14} />}
        title="内容方案"
        detail={row ? firstText(row.title, row.moment.title, '当前情节') : '先选择情节'}
        aside={(
          <ContentWorkbenchUnitTrackMeta
            items={[
              { label: `${summary.total} 条目` },
              { label: formatTrackDuration(summary.durationSec) },
              { label: `${summary.blockedCount} 待补齐`, tone: summary.blockedCount > 0 ? 'warning' : 'neutral' },
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
          <>
            <ContentWorkbenchUnitExecutionGrid>
              {visibleSummary.items.map((item, index) => (
                <ContentWorkbenchUnitExecutionCard
                  key={item.id}
                  active={item.selected}
                  data-track-item-id={item.id}
                  identifier={item.identifier}
                  heading={item.title}
                  summary={shotExpressionText(item)}
                  status={(
                    <ContentWorkbenchUnitExecutionStatus tone={item.state === 'blocked' ? 'blocked' : 'ready'}>
                      {shotStatusText(item)}
                    </ContentWorkbenchUnitExecutionStatus>
                  )}
                  details={(
                    <ContentWorkbenchUnitExecutionDetailGrid>
                      <ContentWorkbenchUnitExecutionDetail label="画面目标" value={shotExpressionText(item)} />
                      <ContentWorkbenchUnitExecutionDetail label="声音/对白" value={shotCueText(item)} />
                      <ContentWorkbenchUnitExecutionDetail label="制作上下文" value={shotMetaText(item)} />
                    </ContentWorkbenchUnitExecutionDetailGrid>
                  )}
                  actions={(
                    <ContentWorkbenchUnitExecutionActionRow>
                      <ContentWorkbenchUnitMoveButton
                        aria-label="上移内容条目"
                        data-testid="content-workbench-unit-move-earlier"
                        disabled={index === 0 || isReordering}
                        onClick={(event) => {
                          event.stopPropagation()
                          moveUnitInList(Number(item.id), 'earlier')
                        }}
                      >
                        <ArrowUp size={12} />
                      </ContentWorkbenchUnitMoveButton>
                      <ContentWorkbenchUnitMoveButton
                        aria-label="下移内容条目"
                        data-testid="content-workbench-unit-move-later"
                        disabled={index === visibleSummary.items.length - 1 || isReordering}
                        onClick={(event) => {
                          event.stopPropagation()
                          moveUnitInList(Number(item.id), 'later')
                        }}
                      >
                        <ArrowDown size={12} />
                      </ContentWorkbenchUnitMoveButton>
                    </ContentWorkbenchUnitExecutionActionRow>
                  )}
                  onClick={() => selectOrClearUnit(Number(item.id))}
                />
              ))}
            </ContentWorkbenchUnitExecutionGrid>
            <ContentWorkbenchShotList title="镜头明细" badge={<Badge variant="outline">{visibleSummary.items.length} 条</Badge>}>
              <ContentWorkbenchShotListGrid>
                {visibleSummary.items.map((item, index) => (
                  <ContentWorkbenchShotListCard
                    key={item.id}
                    active={item.selected}
                    data-track-item-id={item.id}
                    actions={(
                      <ContentWorkbenchShotListActionBar>
                        <ContentWorkbenchUnitMoveButton
                          aria-label="上移镜头"
                          data-testid="content-workbench-shot-list-move-earlier"
                          disabled={index === 0 || isReordering}
                          onClick={() => moveUnitInList(Number(item.id), 'earlier')}
                        >
                          <ArrowUp size={12} />
                        </ContentWorkbenchUnitMoveButton>
                        <ContentWorkbenchUnitMoveButton
                          aria-label="下移镜头"
                          data-testid="content-workbench-shot-list-move-later"
                          disabled={index === visibleSummary.items.length - 1 || isReordering}
                          onClick={() => moveUnitInList(Number(item.id), 'later')}
                        >
                          <ArrowDown size={12} />
                        </ContentWorkbenchUnitMoveButton>
                        {onOpenUnitEditor ? (
                          <ContentWorkbenchUnitMoveButton aria-label="编辑镜头" onClick={() => onOpenUnitEditor(Number(item.id))}>
                            <Edit3 size={12} />
                          </ContentWorkbenchUnitMoveButton>
                        ) : null}
                      </ContentWorkbenchShotListActionBar>
                    )}
                  >
                    <ContentWorkbenchShotListHeader
                      identifier={item.identifier}
                      title={item.title}
                      summary={shotExpressionText(item)}
                      status={<Badge variant="outline">{shotStatusText(item)}</Badge>}
                      onOpen={() => selectOrClearUnit(Number(item.id))}
                    />
                    <ContentWorkbenchShotListFieldGrid>
                      <ContentWorkbenchShotListFieldButton
                        label="关键帧"
                        value={`${item.keyframeTitles.length} 帧`}
                        fieldTone={item.requiresKeyframe && item.keyframeTitles.length === 0 ? 'warning' : 'neutral'}
                        onClick={() => selectOrClearUnit(Number(item.id))}
                      />
                      <ContentWorkbenchShotListFieldButton
                        label="声音/对白"
                        value={shotCueText(item)}
                        wide
                        onClick={() => selectOrClearUnit(Number(item.id))}
                      />
                      <ContentWorkbenchShotListFieldButton
                        label="上下文"
                        value={shotMetaText(item)}
                        wide
                        onClick={() => selectOrClearUnit(Number(item.id))}
                      />
                    </ContentWorkbenchShotListFieldGrid>
                  </ContentWorkbenchShotListCard>
                ))}
              </ContentWorkbenchShotListGrid>
            </ContentWorkbenchShotList>
          </>
        ) : (
          <WorkbenchEmptyState compact title="当前类型下没有条目。" />
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
                <ContentWorkbenchUnitPanelTab active={schedulePanel === 'edit'} disabled={!selectedUnit || !showInlineEditor} onClick={() => setSchedulePanel('edit')}>
                  <FileText size={14} />
                  内容编辑
                </ContentWorkbenchUnitPanelTab>
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
        <ContentWorkbenchUnitInspectorShell>
          <ContentWorkbenchUnitInspectorHeader
            icon={<FileText size={14} />}
            kicker="内容编辑"
            title={selectedUnit ? titleOfRecord(selectedUnit) : '未选择内容条目'}
            detail={selectedUnit ? firstText(selectedUnit.description, selectedUnit.prompt, '补齐画面目标、声音和生成输入。') : '从上方内容方案里选择一个条目。'}
            actions={selectedUnit && onOpenUnitEditor ? (
              <ContentWorkbenchUnitTrackActionButton size="xs" variant="outline" onClick={() => onOpenUnitEditor(selectedUnit.ID)}>
                <Edit3 size={14} />
                打开详情
              </ContentWorkbenchUnitTrackActionButton>
            ) : null}
          />
          <ContentWorkbenchUnitNextActionCard
            tone={selectedUnit ? 'ready' : 'blocked'}
            icon={<Sparkles size={14} />}
            label={selectedUnit ? '补齐生成输入' : '选择内容条目'}
            detail={selectedUnit ? '完善关键帧、素材缺口和提示词后，就可以进入生成或画布检查。' : '选择一个内容条目后，这里会显示可编辑的制作输入。'}
            actionText={selectedUnit && onOpenCanvas ? '打开画布' : undefined}
            onAction={selectedUnit && onOpenCanvas ? onOpenCanvas : undefined}
          />
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
        </ContentWorkbenchUnitInspectorShell>
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
