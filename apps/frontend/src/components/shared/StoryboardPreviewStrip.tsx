import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ImageIcon, Layers, ListVideo, Pause, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { RawResource, ResourceBinding, Shot, Storyboard } from '@/types'
import { AuthedImage, AuthedVideo } from './AuthedImage'
import { resolveResourceUrl } from './MediaViewer'

interface Props {
  projectId?: number
  storyboards: Storyboard[]
  title?: string
  className?: string
}

interface PreviewSegment {
  id: string
  storyboard: Storyboard
  shot?: Shot
  resource?: RawResource
  label: string
  subtitle: string
}

const PLAYABLE_TYPES = new Set<RawResource['type']>(['image', 'video'])
const STORYBOARD_ROLE_PRIORITY = ['final', 'output', 'thumbnail', 'reference', 'source', 'attachment']
const SHOT_ROLE_PRIORITY = ['final', 'output', 'thumbnail', 'source', 'attachment']

export function StoryboardPreviewStrip({ projectId, storyboards, title, className }: Props) {
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const orderedStoryboards = useMemo(() => [...storyboards].sort(compareStoryboardOrder), [storyboards])
  const storyboardIds = useMemo(() => new Set(orderedStoryboards.map((storyboard) => storyboard.ID)), [orderedStoryboards])
  const shotIds = useMemo(() => new Set(orderedStoryboards.flatMap((storyboard) => (storyboard.shots ?? []).map((shot) => shot.ID))), [orderedStoryboards])

  const { data: bindings = [] } = useQuery<ResourceBinding[]>({
    queryKey: ['storyboard-preview-bindings', projectId],
    queryFn: () => api.get(`/projects/${projectId}/resource-bindings`).then((r) => r.data),
    enabled: !!projectId && orderedStoryboards.length > 0,
    staleTime: 60 * 1000,
  })

  const segments = useMemo(() => {
    const storyboardBindings = bindings.filter((binding) => binding.owner_type === 'storyboard' && storyboardIds.has(binding.owner_id))
    const shotBindings = bindings.filter((binding) => binding.owner_type === 'shot' && shotIds.has(binding.owner_id))

    return orderedStoryboards.flatMap((storyboard, storyboardIndex) => {
      const boardSegments: PreviewSegment[] = []
      const storyboardResource = pickResource(storyboardBindings.filter((binding) => binding.owner_id === storyboard.ID), STORYBOARD_ROLE_PRIORITY)
      if (storyboardResource) {
        boardSegments.push({
          id: `storyboard-${storyboard.ID}`,
          storyboard,
          resource: storyboardResource,
          label: storyboardLabel(storyboard, storyboardIndex, t),
          subtitle: storyboard.title || storyboard.description || t('common.emptyTitle'),
        })
      }

      const shotSegments = [...(storyboard.shots ?? [])]
        .sort(compareShotOrder)
        .map((shot): PreviewSegment | null => {
          const resource = pickResource(shotBindings.filter((binding) => binding.owner_id === shot.ID), SHOT_ROLE_PRIORITY)
          if (!resource) return null
          return {
            id: `shot-${shot.ID}`,
            storyboard,
            shot,
            resource,
            label: `${storyboardLabel(storyboard, storyboardIndex, t)} / ${t('details.shotTitle', { order: shot.order })}`,
            subtitle: shot.description || storyboard.description || t('common.emptyDescription'),
          }
        })
        .filter((segment): segment is PreviewSegment => Boolean(segment))

      boardSegments.push(...shotSegments)

      if (boardSegments.length === 0) {
        boardSegments.push({
          id: `storyboard-${storyboard.ID}-empty`,
          storyboard,
          label: storyboardLabel(storyboard, storyboardIndex, t),
          subtitle: storyboard.title || storyboard.description || storyboard.intent || storyboard.actions || t('common.emptyDescription'),
        })
      }

      return boardSegments
    })
  }, [bindings, orderedStoryboards, shotIds, storyboardIds, t])

  const groups = useMemo(() => orderedStoryboards.map((storyboard) => ({
    storyboard,
    firstSegment: segments.find((segment) => segment.storyboard.ID === storyboard.ID) ?? null,
    segmentCount: segments.filter((segment) => segment.storyboard.ID === storyboard.ID).length,
  })), [orderedStoryboards, segments])

  const rawActiveIndex = activeId ? segments.findIndex((segment) => segment.id === activeId) : -1
  const activeIndex = rawActiveIndex >= 0 ? rawActiveIndex : (segments.length > 0 ? 0 : -1)
  const activeSegment = activeIndex >= 0 ? segments[activeIndex] : null
  const activeStoryboardId = activeSegment?.storyboard.ID

  useEffect(() => {
    if (segments.length === 0) {
      setActiveId(null)
      setIsPlaying(false)
      return
    }
    if (!activeId || !segments.some((segment) => segment.id === activeId)) {
      setActiveId(segments[0].id)
      setIsPlaying(false)
    }
  }, [activeId, segments])

  useEffect(() => {
    if (!isPlaying || !activeSegment || activeSegment.resource?.type === 'video') return
    const timer = window.setTimeout(() => advance(), 3000)
    return () => window.clearTimeout(timer)
  }, [activeSegment, isPlaying])

  function advance() {
    if (activeIndex >= 0 && activeIndex < segments.length - 1) {
      setActiveId(segments[activeIndex + 1].id)
      return
    }
    setIsPlaying(false)
  }

  function rewind() {
    if (activeIndex > 0) setActiveId(segments[activeIndex - 1].id)
  }

  function selectStoryboard(storyboardId: number) {
    const target = segments.find((segment) => segment.storyboard.ID === storyboardId)
    if (!target) return
    setActiveId(target.id)
    setIsPlaying(false)
  }

  function playSequence() {
    if (segments.length === 0) return
    if (!activeSegment) setActiveId(segments[0].id)
    setIsPlaying(true)
  }

  if (orderedStoryboards.length === 0) return null

  return (
    <section className={cn('overflow-hidden bg-background', className)}>
      <div className="flex min-h-[34rem] flex-col overflow-hidden">
        <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Layers size={15} className="shrink-0 text-muted-foreground" />
            <h3 className="truncate text-sm font-semibold text-foreground">
              {title ?? t('pages.storyboards.previewStrip', { defaultValue: '分镜预览' })}
            </h3>
            <span className="shrink-0 text-xs text-muted-foreground">{orderedStoryboards.length}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <IconButton onClick={rewind} disabled={activeIndex <= 0} label={t('common.previous', { defaultValue: '上一个' })}>
              <ChevronLeft size={14} />
            </IconButton>
            {isPlaying ? (
              <IconButton onClick={() => setIsPlaying(false)} disabled={segments.length === 0} label={t('common.pause', { defaultValue: '暂停' })}>
                <Pause size={14} />
              </IconButton>
            ) : (
              <IconButton onClick={playSequence} disabled={segments.length === 0} label={t('pages.shots.playAll')}>
                <ListVideo size={14} />
              </IconButton>
            )}
            <IconButton onClick={advance} disabled={activeIndex < 0 || activeIndex >= segments.length - 1} label={t('common.next', { defaultValue: '下一个' })}>
              <ChevronRight size={14} />
            </IconButton>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-card p-4">
          <div className="mx-auto flex h-full min-h-72 max-h-[58vh] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-border bg-background">
            <div className="min-h-0 flex-1 bg-black">
              <PreviewStage segment={activeSegment} isPlaying={isPlaying} onEnded={advance} />
            </div>
            <div className="shrink-0 border-t border-border bg-background px-4 py-3">
              <div className="flex min-w-0 items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{activeSegment?.label ?? t('common.emptyTitle')}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{activeSegment?.subtitle ?? t('common.emptyDescription')}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {segments.length > 0 ? `${activeIndex + 1} / ${segments.length}` : '0 / 0'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-background p-3">
          <p className="mb-2 text-xs text-muted-foreground">
            {t('pages.storyboards.previewHint', { defaultValue: '按顺序点击分镜；连播会从当前预览继续。' })}
          </p>
          <div className="overflow-x-auto overflow-y-hidden pb-1">
            <div className="flex min-w-max gap-3">
              {groups.map(({ storyboard, firstSegment, segmentCount }, index) => (
                <button
                  key={storyboard.ID}
                  type="button"
                  onClick={() => selectStoryboard(storyboard.ID)}
                  className={cn(
                    'flex w-72 shrink-0 overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-ring',
                    activeStoryboardId === storyboard.ID ? 'border-primary ring-1 ring-primary' : 'border-border',
                  )}
                >
                  <div className="relative h-28 w-36 shrink-0 overflow-hidden bg-black">
                    <SegmentThumb segment={firstSegment} />
                    <span className="absolute left-2 top-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
                      {index + 1}
                    </span>
                    {segmentCount > 1 && (
                      <span className="absolute bottom-2 right-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-sm">
                        {segmentCount}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 p-3">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {storyboard.title || t('details.storyboardLabel', { order: storyboard.order })}
                    </p>
                    <p className="mt-1 line-clamp-3 text-[11px] leading-4 text-muted-foreground">
                      {storyboard.description || storyboard.intent || storyboard.actions || t('common.emptyDescription')}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function PreviewStage({ segment, isPlaying, onEnded }: { segment: PreviewSegment | null; isPlaying: boolean; onEnded: () => void }) {
  if (!segment?.resource) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center bg-muted p-6">
        <div className="max-w-sm text-center">
          <ImageIcon size={32} className="mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">{segment?.storyboard.title || segment?.label}</p>
          <p className="mt-2 line-clamp-4 text-xs leading-5 text-muted-foreground">{segment?.subtitle}</p>
        </div>
      </div>
    )
  }

  const src = resolveResourceUrl(segment.resource)
  if (segment.resource.type === 'video') {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center bg-black">
        <AuthedVideo
          key={`${segment.id}-${isPlaying ? 'playing' : 'paused'}`}
          src={src}
          controls
          autoPlay={isPlaying}
          playsInline
          className="h-full w-full object-contain"
          onEnded={isPlaying ? onEnded : undefined}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 w-full items-center justify-center bg-black">
      <AuthedImage src={src} alt={segment.resource.name} className="h-full w-full object-contain" />
    </div>
  )
}

function SegmentThumb({ segment }: { segment: PreviewSegment | null }) {
  const resource = segment?.resource
  if (!resource) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        <ImageIcon size={22} />
      </div>
    )
  }
  const src = resolveResourceUrl(resource)
  if (resource.type === 'video') {
    return (
      <>
        <AuthedVideo src={src} className="h-full w-full object-contain" muted playsInline preload="metadata" />
        <Video size={14} className="absolute bottom-2 left-2 text-white drop-shadow" />
      </>
    )
  }
  return <AuthedImage src={src} alt={resource.name} className="h-full w-full object-contain" />
}

function IconButton({ children, disabled, label, onClick }: { children: ReactNode; disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  )
}

function pickResource(bindings: ResourceBinding[], rolePriority: string[]) {
  return bindings
    .filter((binding) => binding.resource && PLAYABLE_TYPES.has(binding.resource.type))
    .sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
      const roleA = rolePriority.indexOf(a.role)
      const roleB = rolePriority.indexOf(b.role)
      if (roleA !== roleB) return normalizedRank(roleA) - normalizedRank(roleB)
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
      return new Date(a.CreatedAt).getTime() - new Date(b.CreatedAt).getTime()
    })[0]?.resource
}

function normalizedRank(rank: number) {
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank
}

function compareStoryboardOrder(a: Storyboard, b: Storyboard) {
  return (a.order || 0) - (b.order || 0) || a.ID - b.ID
}

function compareShotOrder(a: Shot, b: Shot) {
  return (a.order || 0) - (b.order || 0) || a.ID - b.ID
}

function storyboardLabel(storyboard: Storyboard, index: number, t: (key: string, options?: Record<string, unknown>) => string) {
  return storyboard.order ? t('details.storyboardLabel', { order: storyboard.order }) : `#${index + 1}`
}
