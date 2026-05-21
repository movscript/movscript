import { useEffect, useState } from 'react'
import { Clock3, Route } from 'lucide-react'

import type { ContentUnit, DeliveryTimelineItem } from '@/api/deliveryEntities'
import { buildContentWorkbenchUnitTrack } from '@/lib/contentWorkbenchUnitTrack'
import { deliveryStatusLabel } from '@/lib/deliveryWorkbenchModel'
import { cn } from '@/lib/utils'
import { Badge } from '@movscript/ui'

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
    <div className="border-t border-border p-3" data-testid="delivery-timeline-track">
      <div className="rounded-md border border-border bg-background p-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 type-body font-medium text-foreground">
              <Route size={14} className="text-muted-foreground" />
              成片时间线
            </div>
            <p className="mt-1 type-label leading-5 text-muted-foreground">
              复用内容工作区的制作项时间轴样式；成片预剪辑只关注视频 shot 和关键帧，拖拽视频块右侧可调整最终导出时长。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 type-label text-muted-foreground">
            <span>{summary.total} 视频/关键帧</span>
            <span className="text-border">/</span>
            <span>{formatTrackDuration(summary.durationSec)}</span>
            <span className="text-border">/</span>
            <span className={summary.blockedCount > 0 ? 'text-amber-700 dark:text-amber-300' : undefined}>{summary.blockedCount} 待补齐</span>
          </div>
        </div>

        <div className="mt-2.5 overflow-x-auto pb-1">
          <div className="flex min-w-max gap-2">
            {timelineItems.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid="delivery-timeline-card"
                onClick={() => onSelect(Number(item.id))}
                className={cn(
                  'w-[172px] shrink-0 rounded-md border px-2 py-1.5 text-left transition-colors',
                  item.selected
                    ? 'border-primary/60 bg-primary/5'
                    : item.tone === 'blocked'
                      ? 'border-amber-200 bg-amber-50/60 hover:border-primary/50 hover:bg-primary/5 dark:border-amber-900/60 dark:bg-amber-950/20'
                      : 'border-border bg-card hover:border-primary/50 hover:bg-primary/5',
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 type-tiny tabular-nums text-muted-foreground">{String(item.order).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1 truncate type-body font-medium text-foreground">{item.title}</span>
                </div>
                <span className="mt-1 block truncate type-caption text-muted-foreground">{deliveryKindLabel(item.kind)} · {item.labels.slice(0, 2).join(' · ')}</span>
                <span className={cn('mt-1 block truncate type-caption', item.blockers.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300')}>
                  {item.blockers[0] || '交付输入可用'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-md border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-2.5 py-2">
            <div className="flex min-w-0 items-center gap-2 type-body font-medium text-foreground">
              <Clock3 size={14} className="shrink-0 text-muted-foreground" />
              <span className="truncate">成片时间轴</span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <div className="flex items-center overflow-hidden rounded-md border border-border bg-background">
                <button type="button" className="h-7 px-2 type-label text-muted-foreground hover:bg-primary/5 hover:text-foreground" onClick={() => setTimelineZoom((value) => Math.max(0.05, Math.round((value / 1.25) * 1000) / 1000))} aria-label="缩小时间轴">-</button>
                <span className="border-x border-border px-2 type-caption tabular-nums text-muted-foreground">{Math.round(timelineZoom * 100)}%</span>
                <button type="button" className="h-7 px-2 type-label text-muted-foreground hover:bg-primary/5 hover:text-foreground" onClick={() => setTimelineZoom((value) => Math.round((value * 1.25) * 1000) / 1000)} aria-label="放大时间轴">+</button>
                <button type="button" className="h-7 border-l border-border px-2 type-caption text-muted-foreground hover:bg-primary/5 hover:text-foreground" onClick={() => setTimelineZoom(1)} aria-label="重置时间轴缩放">1:1</button>
              </div>
              {selectedItem ? <Badge variant="secondary">播放头 {formatTrackClock(selectedStartSec)}</Badge> : null}
              <Badge variant="outline">{formatTrackDuration(timelineContentDurationSec)}</Badge>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div style={{ minWidth: canvasWidth }}>
              <div className="border-b border-border bg-background px-2.5 py-2.5">
                <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
                  <div className="type-caption font-medium text-muted-foreground">时间尺</div>
                  <div className="relative h-8 rounded bg-muted/40">
                    {selectedItem ? (
                      <div className="absolute top-0 z-10 h-full border-l-2 border-primary" style={{ left: trackTimelinePx(selectedStartSec, pxPerSec) }}>
                        <span className="ml-1 mt-1 block rounded bg-primary px-1 py-0.5 type-tiny leading-none text-primary-foreground shadow-sm">{formatTrackClock(selectedStartSec)}</span>
                      </div>
                    ) : null}
                    {ticks.map((tick) => (
                      <div key={tick.seconds} className="absolute top-0 h-full border-l border-border/80 pl-1" style={{ left: trackTimelinePx(tick.seconds, pxPerSec) }}>
                        <span className="absolute bottom-0 type-tiny leading-4 text-muted-foreground">{tick.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-2 space-y-1.5">
                  {lanes.map((lane) => (
                    <div key={lane.key} className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
                      <div className="min-w-0 rounded bg-muted/30 px-2 py-1.5">
                        <p className="truncate type-caption font-medium text-foreground">{lane.label}</p>
                        <p className="mt-0.5 truncate type-tiny text-muted-foreground">{lane.detail}</p>
                      </div>
                      <div className="relative h-[46px] rounded border border-border bg-muted/20" data-testid="delivery-timeline-lane" data-lane-kind={lane.key}>
                        {selectedItem ? <span aria-hidden="true" className="pointer-events-none absolute top-0 z-10 h-full border-l-2 border-primary/70" style={{ left: trackTimelinePx(selectedStartSec, pxPerSec) }} /> : null}
                        {ticks.map((tick) => (
                          <span key={`${lane.key}-${tick.seconds}`} className="pointer-events-none absolute top-0 h-full border-l border-border/50" style={{ left: trackTimelinePx(tick.seconds, pxPerSec) }} />
                        ))}
                        {lane.items.map((item) => {
                          const isVideo = item.kind === 'video'
                          const previewDuration = resizing?.id === Number(item.id) ? resizing.nextDurationSec : item.durationSec
                          return (
                            <button
                              key={`${lane.key}-${item.id}`}
                              type="button"
                              data-testid="delivery-timeline-block"
                              onClick={() => onSelect(Number(item.id))}
                              className={cn(
                                'absolute top-1 h-9 min-w-0 overflow-hidden rounded border px-1.5 py-1 text-left type-caption shadow-sm transition-colors hover:border-primary/60 hover:bg-primary/5',
                                item.selected ? 'border-primary/70 bg-primary/10' : item.tone === 'blocked' ? 'border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/20' : 'border-border bg-card',
                              )}
                              style={{
                                left: trackTimelinePx(deliveryLocalTimelineSec(item.startSec, timelineOriginSec), pxPerSec),
                                width: trackTimelineWidthPx(previewDuration, pxPerSec),
                              }}
                            >
                              <span className="block truncate font-medium text-foreground">{String(item.order).padStart(2, '0')} {item.title}</span>
                              <span className={cn('block truncate type-tiny', item.tone === 'blocked' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
                                {item.blockers[0] || formatTrackTimeRange(deliveryLocalTimelineSec(item.startSec, timelineOriginSec), deliveryLocalTimelineSec(item.startSec, timelineOriginSec) + previewDuration, previewDuration)}
                              </span>
                              {isVideo ? (
                                <span
                                  role="separator"
                                  aria-orientation="vertical"
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
                                  className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r bg-primary/0 hover:bg-primary/30"
                                />
                              ) : null}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-[64px_96px_104px_minmax(220px,1fr)_160px_104px] gap-2 border-b border-border bg-muted/30 px-2.5 py-1.5 type-caption font-medium text-muted-foreground">
                <span>顺序</span>
                <span>时间</span>
                <span>类型</span>
                <span>内容</span>
                <span>关键帧 / 缺口</span>
                <span className="text-right">状态</span>
              </div>
              {summary.items.map((item) => (
                <button
                  key={`schedule-${item.id}`}
                  type="button"
                  data-testid="delivery-schedule-row"
                  onClick={() => onSelect(Number(item.id))}
                  className={cn(
                    'grid w-full grid-cols-[64px_96px_104px_minmax(220px,1fr)_160px_104px] gap-2 border-b border-border/70 px-2.5 py-2 text-left type-label transition-colors last:border-b-0 hover:bg-primary/5',
                    item.selected ? 'bg-primary/5' : 'bg-background',
                  )}
                >
                  <span className="tabular-nums text-muted-foreground">{String(item.order).padStart(2, '0')}</span>
                  <span className="tabular-nums text-muted-foreground">{formatTrackTimeRange(deliveryLocalTimelineSec(item.startSec, timelineOriginSec), deliveryLocalTimelineSec(item.endSec, timelineOriginSec), item.durationSec)}</span>
                  <span className="truncate text-foreground">{deliveryKindLabel(item.kind)}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{item.title}</span>
                    <span className="mt-0.5 block truncate type-caption text-muted-foreground">{item.summary || '交付片段'}</span>
                  </span>
                  <span className={cn('truncate', item.missingAssetTitles.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
                    {item.keyframeTitles[0] || item.missingAssetTitles[0] || '资源已挂载或无需资源'}
                  </span>
                  <span className="flex justify-end overflow-hidden">
                    <Badge variant={item.tone === 'blocked' ? 'warning' : item.tone === 'ready' ? 'success' : item.tone === 'running' ? 'secondary' : 'outline'} className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap type-tiny">
                      {item.blockers.length > 0 ? item.blockers[0] : deliveryStatusLabel(items.find((entry) => String(entry.ID) === item.id)?.status ?? 'confirmed')}
                    </Badge>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
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
