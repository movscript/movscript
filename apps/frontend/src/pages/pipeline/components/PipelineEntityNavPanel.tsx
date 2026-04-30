import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Film, Clapperboard, Layers, GripVertical, ChevronDown, ChevronRight, Image, Database } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { useProjectStore } from '@/store/projectStore'
import type { Episode, Scene, Storyboard, Asset, Setting } from '@/types'
import { cn } from '@/lib/utils'

// ── Drag data type ────────────────────────────────────────────────────────────

export interface PipelineEntityDragItem {
  entityType: string
  entityId: number
  label: string
  suggestedNodeType: string
}

export const PIPELINE_ENTITY_DRAG_TYPE = 'application/pipeline-entity'

// ── Section definitions ───────────────────────────────────────────────────────

const SECTIONS = [
  {
    key: 'setting',
    labelKey: 'entities.settings',
    icon: Database,
    iconColor: 'text-teal-500',
    bgColor: 'bg-teal-500/10',
    suggestedNodeType: 'setting_creation',
  },
  {
    key: 'episode',
    labelKey: 'entities.episodes',
    icon: Film,
    iconColor: 'text-violet-500',
    bgColor: 'bg-violet-500/10',
    suggestedNodeType: 'episode',
  },
  {
    key: 'scene',
    labelKey: 'entities.scenes',
    icon: Clapperboard,
    iconColor: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    suggestedNodeType: 'scene',
  },
  {
    key: 'storyboard',
    labelKey: 'entities.storyboards',
    icon: Layers,
    iconColor: 'text-teal-500',
    bgColor: 'bg-teal-500/10',
    suggestedNodeType: 'storyboard',
  },
  {
    key: 'asset',
    labelKey: 'entities.assets',
    icon: Image,
    iconColor: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    suggestedNodeType: 'asset',
  },
] as const

// ── Draggable item ────────────────────────────────────────────────────────────

interface DraggableItemProps {
  entityType: string
  entityId: number
  label: string
  suggestedNodeType: string
}

function DraggableItem({ entityType, entityId, label, suggestedNodeType }: DraggableItemProps) {
  function onDragStart(e: React.DragEvent) {
    const data: PipelineEntityDragItem = { entityType, entityId, label, suggestedNodeType }
    e.dataTransfer.setData(PIPELINE_ENTITY_DRAG_TYPE, JSON.stringify(data))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cn(
        'mx-2 mb-1 px-2.5 py-2 rounded-lg border border-border bg-background',
        'hover:border-primary/40 hover:bg-accent/30 transition-colors',
        'cursor-grab active:cursor-grabbing flex items-center gap-2 group',
      )}
    >
      <GripVertical size={11} className="text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition-colors" />
      <span className="text-xs text-foreground truncate flex-1 leading-tight">{label}</span>
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function PipelineEntityNavPanel() {
  const { t } = useTranslation()
  const project = useProjectStore((s) => s.current)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    setting: true, episode: true, scene: false, storyboard: false, asset: false,
  })

  function toggle(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const { data: episodes = [] } = useQuery<Episode[]>({
    queryKey: ['pipeline-nav-episodes', project?.ID],
    queryFn: () => api.get(`/projects/${project!.ID}/episodes`).then((r) => r.data),
    enabled: !!project,
    staleTime: 30_000,
  })

  const { data: settings = [] } = useQuery<Setting[]>({
    queryKey: ['pipeline-nav-settings', project?.ID],
    queryFn: () => api.get(`/projects/${project!.ID}/settings`).then((r) => r.data),
    enabled: !!project,
    staleTime: 30_000,
  })

  const { data: scenes = [] } = useQuery<Scene[]>({
    queryKey: ['pipeline-nav-scenes', project?.ID],
    queryFn: () => api.get(`/projects/${project!.ID}/scenes`).then((r) => r.data),
    enabled: !!project,
    staleTime: 30_000,
  })

  const { data: storyboards = [] } = useQuery<Storyboard[]>({
    queryKey: ['pipeline-nav-storyboards', project?.ID],
    queryFn: () => api.get(`/projects/${project!.ID}/storyboards`).then((r) => r.data),
    enabled: !!project,
    staleTime: 30_000,
  })

  const { data: assets = [] } = useQuery<Asset[]>({
    queryKey: ['pipeline-nav-assets', project?.ID],
    queryFn: () => api.get(`/projects/${project!.ID}/assets`).then((r) => r.data),
    enabled: !!project,
    staleTime: 30_000,
  })

  const itemsMap: Record<string, DraggableItemProps[]> = {
    setting: settings.map((s) => ({
      entityType: 'setting',
      entityId: s.ID,
      label: `${s.name}${s.type ? ` · ${s.type}` : ''}`,
      suggestedNodeType: 'setting_creation',
    })),
    episode: episodes.map((e) => ({
      entityType: 'episode',
      entityId: e.ID,
      label: `EP${String(e.number).padStart(2, '0')} ${e.title}`,
      suggestedNodeType: 'episode',
    })),
    scene: scenes.map((s) => ({
      entityType: 'scene',
      entityId: s.ID,
      label: t('details.sceneLabel', { number: s.number }) + (s.title ? ` ${s.title}` : ''),
      suggestedNodeType: 'scene',
    })),
    storyboard: storyboards.map((b) => ({
      entityType: 'storyboard',
      entityId: b.ID,
      label: b.title || t('details.storyboardLabel', { order: b.order }),
      suggestedNodeType: 'storyboard',
    })),
    asset: assets.map((a) => ({
      entityType: 'asset',
      entityId: a.ID,
      label: a.name,
      suggestedNodeType: 'asset',
    })),
  }

  return (
    <div className="w-52 border-r border-border bg-card flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border shrink-0">
        <p className="text-xs font-semibold text-foreground">{t('pipeline.nav.title')}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{t('pipeline.nav.hint')}</p>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">
        {SECTIONS.map((sec) => {
          const Icon = sec.icon
          const sectionLabel = t(sec.labelKey)
          const items = itemsMap[sec.key] ?? []
          const isOpen = openSections[sec.key]

          return (
            <div key={sec.key}>
              <button
                onClick={() => toggle(sec.key)}
                className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 transition-colors text-left"
              >
                <div className={cn('w-5 h-5 rounded-md flex items-center justify-center shrink-0', sec.bgColor)}>
                  <Icon size={11} className={sec.iconColor} />
                </div>
                <span className="text-xs font-semibold text-foreground flex-1">{sectionLabel}</span>
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono tabular-nums">
                  {items.length}
                </span>
                {isOpen
                  ? <ChevronDown size={11} className="text-muted-foreground shrink-0" />
                  : <ChevronRight size={11} className="text-muted-foreground shrink-0" />
                }
              </button>

              {isOpen && (
                <div className="pb-1">
                  {items.length === 0 ? (
                    <p className="px-3 py-1.5 text-[10px] text-muted-foreground">{t('pipeline.nav.emptySection', { section: sectionLabel })}</p>
                  ) : (
                    items.map((item) => (
                      <DraggableItem key={item.entityId} {...item} />
                    ))
                  )}
                </div>
              )}

              <div className="border-t border-border/40 mx-2" />
            </div>
          )
        })}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-border shrink-0 bg-muted/30">
        <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
          {t('pipeline.nav.footerLine1')}<br />{t('pipeline.nav.footerLine2')}
        </p>
      </div>
    </div>
  )
}
