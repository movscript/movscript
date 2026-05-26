import { useEffect, useState } from 'react'
import { Clock3, Route } from 'lucide-react'

import type { ContentUnit, DeliveryTimelineItem } from '@/shared/infrastructure/api/deliveryEntities'
import { buildContentWorkbenchUnitTrack } from '@/features/content/domain/contentWorkbenchUnitTrack'
import { deliveryStatusLabel } from '@/features/delivery/domain/deliveryWorkbenchModel'
import { deliveryTimelineItemRecipe } from '@/features/delivery/presentation/deliverySemanticUi'
import {
  ProductionDeliveryTimelineBadge,
  ProductionDeliveryTimelineBlock,
  ProductionDeliveryTimelineCanvas,
  ProductionDeliveryTimelineCard,
  ProductionDeliveryTimelineCardRail,
  ProductionDeliveryTimelineFrame,
  ProductionDeliveryTimelineLane,
  ProductionDeliveryTimelineLaneStack,
  ProductionDeliveryTimelineMeta,
  ProductionDeliveryTimelinePlayhead,
  ProductionDeliveryTimelineResizeHandle,
  ProductionDeliveryTimelineRow,
  ProductionDeliveryTimelineRuler,
  ProductionDeliveryTimelineSchedule,
  ProductionDeliveryTimelineScheduleMetaText,
  ProductionDeliveryTimelineScheduleRow,
  ProductionDeliveryTimelineSection,
  ProductionDeliveryTimelineStatusBadge,
  ProductionDeliveryTimelineTick,
  ProductionDeliveryTimelineToolbar,
  ProductionDeliveryTimelineTrack,
  ProductionDeliveryTimelineViewport,
  ProductionDeliveryTimelineZoomControl,
} from '@movscript/ui'

export function DeliveryTimelineTrack({
  items,
  contentUnitById,
  selectedId,
  onSelect,
  onPatchItem,
}: {
  items: DeliveryTimelineItem[]
  contentUnitById: Map<number, ContentUnit>
  selectedId: number | null
  onSelect: (id: number) => void
  onPatchItem: (id: number, payload: Partial<DeliveryTimelineItem>) => void
}) {
  const [timelineZoom, setTimelineZoom] = useState(1)
  const [resizing, setResizing] = useState<{
    id: number
    startClientX: number
    startDurationSec: number
    nextDurationSec: number
    pxPerSec: number
  } | null>(null)

  useEffect(() => {
    if (!resizing) return
    const activeResize = resizing
    function handlePointerMove(event: PointerEvent) {
      const deltaSec = (event.clientX - activeResize.startClientX) / activeResize.pxPerSec
      const nextDurationSec = Math.max(0.5, Math.round((activeResize.startDurationSec + deltaSec) * 10) / 10)
      setResizing((current) => current && current.id === activeResize.id ? { ...current, nextDurationSec } : current)
    }
    function handlePointerUp() {
      onPatchItem(activeResize.id, { duration_sec: activeResize.nextDurationSec })
      setResizing(null)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [onPatchItem, resizing])

  const focusedItems = items.filter((item) => deliveryTimelineVisualKind(item) !== null)
  const summary = buildContentWorkbenchUnitTrack(focusedItems.map((item) => {
    const contentUnit = item.content_unit_id ? contentUnitById.get(item.content_unit_id) : undefined
    const kind = deliveryTimelineVisualKind(item) ?? 'video'
    const requiresResource = ['video', 'image', 'audio'].includes(kind)
    const missingResource = requiresResource && !item.resource_id
    const missingStatus = ['missing', 'needs_asset'].includes(String(item.status ?? ''))
    return {
      id: item.ID,
      title: item.label || contentUnit?.title || `片段 ${item.ID}`,
      kind,
      startSec: item.start_sec,
      durationSec: item.duration_sec,
      status: item.status,
      summary: contentUnit ? contentUnit.title : item.metadata_json,
      sceneMomentTitle: item.scene_moment_id ? `#${item.scene_moment_id}` : '',
      segmentTitle: item.segment_id ? `#${item.segment_id}` : '',
      keyframeTitles: item.keyframe_id ? [`关键帧 #${item.keyframe_id}`] : [],
      missingAssetTitles: missingResource || missingStatus ? ['成片资源未锁定'] : [],
      requiresKeyframe: false,
      timeSource: 'preview' as const,
      hasPrompt: true,
      assetSlotCount: item.resource_id ? 1 : 0,
      missingSlotCount: missingResource || missingStatus ? 1 : 0,
      keyframeCount: item.keyframe_id ? 1 : 0,
      selected: selectedId === item.ID,
    }
  }))
  const timelineItems = summary.items
  const timelineOriginSec = deliveryTimelineOriginSec(timelineItems)
  const timelineContentDurationSec = Math.max(1, summary.items.reduce((max, item) => Math.max(max, item.endSec - timelineOriginSec), 0))
  const pxPerSec = deliveryTimelinePxPerSec(timelineZoom)
  const rulerWidth = deliveryTimelineRulerWidth(timelineItems, timelineOriginSec, pxPerSec)
  const canvasWidth = rulerWidth + 124
  const timelineDurationSec = rulerWidth / pxPerSec
  const ticks = buildDeliveryTimeTicks(timelineDurationSec, pxPerSec)
  const selectedItem = timelineItems.find((item) => item.selected) ?? timelineItems[0] ?? null
  const selectedStartSec = selectedItem ? deliveryLocalTimelineSec(selectedItem.startSec, timelineOriginSec) : 0
  const lanes = Array.from(new Set(timelineItems.map((item) => String(item.kind || 'video'))))
    .sort((a, b) => deliveryTimelineKindRank(a) - deliveryTimelineKindRank(b) || deliveryKindLabel(a).localeCompare(deliveryKindLabel(b), 'zh-Hans-CN'))
    .map((kind) => ({
      key: kind,
      label: deliveryKindLabel(kind),
      detail: deliveryLaneDetail(kind),
      items: timelineItems.filter((item) => String(item.kind || 'video') === kind),
    }))

  return (
    <ProductionDeliveryTimelineTrack>
      <ProductionDeliveryTimelineSection
        icon={Route}
        title="成片时间线"
        description="复用内容工作区的制作项时间轴样式；成片预剪辑只关注视频 shot 和关键帧，拖拽视频块右侧可调整最终导出时长。"
        action={(
          <ProductionDeliveryTimelineMeta
            items={[
              { label: `${summary.total} 视频/关键帧` },
              { label: formatTrackDuration(summary.durationSec) },
              { label: `${summary.blockedCount} 待补齐`, tone: summary.blockedCount > 0 ? 'warning' : 'neutral' },
            ]}
          />
        )}
      >
        <ProductionDeliveryTimelineCardRail>
          {timelineItems.map((item) => (
            <ProductionDeliveryTimelineCard
              key={item.id}
              active={item.selected}
              tone={item.state === 'blocked' ? 'blocked' : 'ready'}
              order={String(item.order).padStart(2, '0')}
              title={item.title}
              subtitle={`${deliveryKindLabel(item.kind)} · ${item.labels.slice(0, 2).join(' · ')}`}
              status={item.blockers[0] || '交付输入可用'}
              onClick={() => onSelect(Number(item.id))}
            />
          ))}
        </ProductionDeliveryTimelineCardRail>

        <ProductionDeliveryTimelineFrame>
          <ProductionDeliveryTimelineToolbar
            icon={<Clock3 size={14} />}
            title="成片时间轴"
            actions={(
              <>
              <ProductionDeliveryTimelineZoomControl
                zoom={timelineZoom}
                onZoomOut={() => setTimelineZoom((value) => Math.max(0.05, Math.round((value / 1.25) * 1000) / 1000))}
                onZoomIn={() => setTimelineZoom((value) => Math.round((value * 1.25) * 1000) / 1000)}
                onReset={() => setTimelineZoom(1)}
              />
              {selectedItem ? <ProductionDeliveryTimelineBadge>播放头 {formatTrackClock(selectedStartSec)}</ProductionDeliveryTimelineBadge> : null}
              <ProductionDeliveryTimelineBadge variant="outline">{formatTrackDuration(timelineContentDurationSec)}</ProductionDeliveryTimelineBadge>
              </>
            )}
          />
          <ProductionDeliveryTimelineViewport minWidth={canvasWidth}>
              <ProductionDeliveryTimelineCanvas>
                <ProductionDeliveryTimelineRow label="时间尺">
                  <ProductionDeliveryTimelineRuler>
                    {selectedItem ? (
                      <ProductionDeliveryTimelinePlayhead left={trackTimelinePx(selectedStartSec, pxPerSec)} label={formatTrackClock(selectedStartSec)} />
                    ) : null}
                    {ticks.map((tick) => (
                      <ProductionDeliveryTimelineTick key={tick.seconds} left={trackTimelinePx(tick.seconds, pxPerSec)} label={tick.label} />
                    ))}
                  </ProductionDeliveryTimelineRuler>
                </ProductionDeliveryTimelineRow>
                <ProductionDeliveryTimelineLaneStack>
                  {lanes.map((lane) => (
                    <ProductionDeliveryTimelineLane key={lane.key} laneKind={lane.key} label={lane.label} detail={lane.detail}>
                        {selectedItem ? <ProductionDeliveryTimelinePlayhead subtle left={trackTimelinePx(selectedStartSec, pxPerSec)} /> : null}
                        {ticks.map((tick) => (
                          <ProductionDeliveryTimelineTick key={`${lane.key}-${tick.seconds}`} left={trackTimelinePx(tick.seconds, pxPerSec)} />
                        ))}
                        {lane.items.map((item) => {
                          const isVideo = item.kind === 'video'
                          const previewDuration = resizing?.id === Number(item.id) ? resizing.nextDurationSec : item.durationSec
                          return (
                            <ProductionDeliveryTimelineBlock
                              key={`${lane.key}-${item.id}`}
                              active={item.selected}
                              tone={item.state === 'blocked' ? 'blocked' : 'default'}
                              left={trackTimelinePx(deliveryLocalTimelineSec(item.startSec, timelineOriginSec), pxPerSec)}
                              width={trackTimelineWidthPx(previewDuration, pxPerSec)}
                              title={`${String(item.order).padStart(2, '0')} ${item.title}`}
                              detail={item.blockers[0] || formatTrackTimeRange(deliveryLocalTimelineSec(item.startSec, timelineOriginSec), deliveryLocalTimelineSec(item.startSec, timelineOriginSec) + previewDuration, previewDuration)}
                              onClick={() => onSelect(Number(item.id))}
                              resizeHandle={isVideo ? (
                                <ProductionDeliveryTimelineResizeHandle
                                  aria-label="拖拽调整 shot 时长"
                                  title="拖拽调整 shot 时长"
                                  onPointerDown={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    onSelect(Number(item.id))
                                    setResizing({
                                      id: Number(item.id),
                                      startClientX: event.clientX,
                                      startDurationSec: item.durationSec,
                                      nextDurationSec: item.durationSec,
                                      pxPerSec,
                                    })
                                  }}
                                />
                              ) : null}
                            />
                          )
                        })}
                    </ProductionDeliveryTimelineLane>
                  ))}
                </ProductionDeliveryTimelineLaneStack>
              </ProductionDeliveryTimelineCanvas>
          </ProductionDeliveryTimelineViewport>
          <ProductionDeliveryTimelineSchedule>
              {summary.items.map((item) => (
                <ProductionDeliveryTimelineScheduleRow
                  key={`schedule-${item.id}`}
                  active={item.selected}
                  onClick={() => onSelect(Number(item.id))}
                  order={String(item.order).padStart(2, '0')}
                  title={item.title}
                  summary={item.summary || '交付片段'}
                  status={(
                    <ProductionDeliveryTimelineStatusBadge
                      {...deliveryTimelineItemRecipe(item.state)}
                      label={item.blockers.length > 0 ? item.blockers[0] : deliveryStatusLabel(items.find((entry) => String(entry.ID) === item.id)?.status ?? 'confirmed')}
                    />
                  )}
                  meta={(
                    <>
                    <ProductionDeliveryTimelineBadge variant="outline">{formatTrackTimeRange(deliveryLocalTimelineSec(item.startSec, timelineOriginSec), deliveryLocalTimelineSec(item.endSec, timelineOriginSec), item.durationSec)}</ProductionDeliveryTimelineBadge>
                    <ProductionDeliveryTimelineBadge variant="outline">{deliveryKindLabel(item.kind)}</ProductionDeliveryTimelineBadge>
                    <ProductionDeliveryTimelineScheduleMetaText intent={item.missingAssetTitles.length > 0 ? 'warning' : undefined}>
                      {item.keyframeTitles[0] || item.missingAssetTitles[0] || '资源已挂载或无需资源'}
                    </ProductionDeliveryTimelineScheduleMetaText>
                    </>
                  )}
                />
              ))}
          </ProductionDeliveryTimelineSchedule>
        </ProductionDeliveryTimelineFrame>
      </ProductionDeliveryTimelineSection>
    </ProductionDeliveryTimelineTrack>
  )
}

function formatTrackDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '未设时长'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`
}

function formatTrackTimeRange(startSec: number, endSec: number, durationSec: number) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return '未设'
  return `${formatTrackClock(startSec)}-${formatTrackClock(endSec)}`
}

function formatTrackClock(seconds: number) {
  const rounded = Math.max(0, Math.round(Number(seconds) || 0))
  const minutes = Math.floor(rounded / 60)
  const rest = rounded % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

function buildDeliveryTimeTicks(durationSec: number, pxPerSec: number) {
  const duration = Math.max(1, Math.ceil(Number(durationSec) || 1))
  const targetLabelGapPx = 72
  const interval = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((step) => step * pxPerSec >= targetLabelGapPx) ?? 900
  const tickCount = Math.ceil(duration / interval)
  return Array.from({ length: tickCount + 1 }, (_, index) => {
    const seconds = index * interval
    return { seconds, label: formatTrackClock(seconds) }
  })
}

function deliveryTimelinePxPerSec(zoom: number) {
  return Math.max(1.8, 36 * Math.max(0.05, Number(zoom) || 1))
}

function deliveryTimelineRulerWidth(items: Array<{ endSec: number; durationSec: number }>, originSec: number, pxPerSec: number) {
  const maxEndSec = items.reduce((max, item) => Math.max(max, deliveryLocalTimelineSec(item.endSec, originSec)), 0)
  const longestItemSec = items.reduce((max, item) => Math.max(max, Number(item.durationSec) || 0), 0)
  const visibleSeconds = Math.max(30, maxEndSec + Math.max(20, longestItemSec * 2))
  return Math.max(1200, Math.round(visibleSeconds * pxPerSec))
}

function trackTimelinePx(seconds: number, pxPerSec: number) {
  return Math.round(Math.max(0, Number(seconds) || 0) * pxPerSec)
}

function trackTimelineWidthPx(durationSec: number, pxPerSec: number) {
  return Math.max(18, Math.round(Math.max(0.1, Number(durationSec) || 0.1) * pxPerSec))
}

function deliveryTimelineOriginSec(items: Array<{ startSec: number }>) {
  const starts = items
    .map((item) => Number(item.startSec))
    .filter((value) => Number.isFinite(value) && value > 0)
  if (starts.length === 0) return 0
  return Math.round(Math.min(...starts) * 10) / 10
}

function deliveryLocalTimelineSec(seconds: number, originSec: number) {
  return Math.max(0, Math.round(((Number(seconds) || 0) - originSec) * 10) / 10)
}

function deliveryTimelineVisualKind(item: DeliveryTimelineItem): 'video' | 'keyframe' | null {
  const kind = String(item.kind ?? '').toLowerCase()
  if (kind === 'video' || kind === 'shot') return 'video'
  if (kind === 'image' || kind === 'keyframe' || kind === 'still') return 'keyframe'
  return null
}

function deliveryTimelineKindRank(kind: string) {
  if (kind === 'video') return 0
  if (kind === 'keyframe') return 1
  return 10
}

function deliveryKindLabel(kind: string) {
  if (kind === 'video') return '视频 Shot'
  if (kind === 'keyframe') return '关键帧'
  if (kind === 'caption') return '字幕'
  if (kind === 'audio') return '音频'
  if (kind === 'gap') return '空隙'
  return kind || '片段'
}

function deliveryLaneDetail(kind: string) {
  if (kind === 'video') return '可缩拉时长 · 最终导出依据'
  if (kind === 'keyframe') return '画面锚点 · 参考帧'
  return '交付片段'
}
