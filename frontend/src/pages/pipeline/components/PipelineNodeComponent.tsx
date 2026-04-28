import {
  ArrowRight, Box, CalendarDays, Camera, ChevronDown, ChevronRight,
  Clapperboard, FileEdit, FileText, Film, Hammer, Layers, MoreHorizontal,
  Package, PenLine, Plus, Scissors, Trash2,
} from 'lucide-react'
import type React from 'react'
import type { PipelineNode } from '@/types'
import { Button } from '@movscript/ui'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { ARTIFACT_NODE_TYPES, WORK_NODE_TYPES, getPipelineNodeSpec } from '../nodeSpec'

export type NodeCategory = 'work' | 'artifact' | 'custom'

interface NodeTypeMeta {
  label: string
  icon: React.ElementType
  category: NodeCategory
  desc?: string
  accent: string
  iconColor: string
}

export const NODE_TYPE_META: Record<string, NodeTypeMeta> = {
  script_writing:       { label: 'Script Writing',         icon: PenLine,      category: 'work',     desc: 'Create the main script',               accent: 'bg-blue-500/10 text-blue-600',       iconColor: 'text-blue-500' },
  episode_writing:      { label: 'Episode Script Writing', icon: Film,         category: 'work',     desc: 'Create episode scripts',               accent: 'bg-violet-500/10 text-violet-600',   iconColor: 'text-violet-500' },
  scene_writing:        { label: 'Scene Script Writing',   icon: Clapperboard, category: 'work',     desc: 'Create scene scripts',                 accent: 'bg-indigo-500/10 text-indigo-600',   iconColor: 'text-indigo-500' },
  storyboard_creation:  { label: 'Storyboard Creation',    icon: Layers,       category: 'work',     desc: 'Create storyboard scripts',            accent: 'bg-cyan-500/10 text-cyan-600',       iconColor: 'text-cyan-500' },
  asset_creation:       { label: 'Asset Creation',         icon: Hammer,       category: 'work',     desc: 'Create characters, scenes, and props', accent: 'bg-emerald-500/10 text-emerald-600', iconColor: 'text-emerald-500' },
  raw_script:           { label: 'Draft Writing',          icon: FileEdit,     category: 'work',     desc: 'Original draft or outline',            accent: 'bg-amber-500/10 text-amber-600',     iconColor: 'text-amber-500' },
  shot_production:      { label: 'Shot Production',        icon: Camera,       category: 'work',     desc: 'Generate shots with AI',               accent: 'bg-orange-500/10 text-orange-600',   iconColor: 'text-orange-500' },
  episode_edit:         { label: 'Episode Editing',        icon: Scissors,     category: 'work',     desc: 'Post-production editing',              accent: 'bg-rose-500/10 text-rose-600',       iconColor: 'text-rose-500' },

  main_script:          { label: 'Main Script',            icon: FileText,     category: 'artifact', desc: 'Complete main script artifact',          accent: 'bg-sky-500/10 text-sky-600',         iconColor: 'text-sky-500' },
  episode_script:       { label: 'Episode Script',         icon: Film,         category: 'artifact', desc: 'Script split by episode',               accent: 'bg-purple-500/10 text-purple-600',   iconColor: 'text-purple-500' },
  scene_script:         { label: 'Scene Script',           icon: Clapperboard, category: 'artifact', desc: 'Script split by scene',                 accent: 'bg-blue-500/10 text-blue-600',       iconColor: 'text-blue-500' },
  storyboard_script:    { label: 'Storyboard Script',      icon: Layers,       category: 'artifact', desc: 'Storyboard description script',         accent: 'bg-teal-500/10 text-teal-600',       iconColor: 'text-teal-500' },
  episode:              { label: 'Episode',                icon: Film,         category: 'artifact', desc: 'Episode artifact',                      accent: 'bg-purple-500/10 text-purple-600',   iconColor: 'text-purple-500' },
  scene:                { label: 'Scene',                  icon: Clapperboard, category: 'artifact', desc: 'Scene artifact',                        accent: 'bg-blue-500/10 text-blue-600',       iconColor: 'text-blue-500' },
  storyboard:           { label: 'Storyboard',             icon: Layers,       category: 'artifact', desc: 'Storyboard artifact',                   accent: 'bg-teal-500/10 text-teal-600',       iconColor: 'text-teal-500' },
  asset:                { label: 'Asset',                  icon: Package,      category: 'artifact', desc: 'Asset artifact',                        accent: 'bg-green-500/10 text-green-600',     iconColor: 'text-green-500' },
  shot:                 { label: 'Shot',                   icon: Camera,       category: 'artifact', desc: 'Shot artifact',                          accent: 'bg-orange-500/10 text-orange-600',   iconColor: 'text-orange-500' },

  custom:               { label: 'Custom',                 icon: Box,          category: 'custom',   desc: 'Define a custom type',                 accent: 'bg-muted text-muted-foreground',     iconColor: 'text-muted-foreground' },
}

const FALLBACK_META: NodeTypeMeta = {
  label: 'Unknown',
  icon: Box,
  category: 'custom',
  accent: 'bg-muted text-muted-foreground',
  iconColor: 'text-muted-foreground',
}

const STATUS_META: Record<string, { dot: string; badge: string; label: string }> = {
  draft:        { dot: 'bg-muted-foreground/40', badge: 'bg-muted text-muted-foreground', label: 'Draft' },
  under_review: { dot: 'bg-amber-500',           badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400', label: 'In Review' },
  rejected:     { dot: 'bg-destructive',         badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400', label: 'Rejected' },
  final:        { dot: 'bg-green-500',           badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400', label: 'Final' },
}

export function getPipelineNodeMeta(type: string) {
  return NODE_TYPE_META[type] ?? FALLBACK_META
}

export function isPipelineWorkNode(type: string) {
  return getPipelineNodeSpec(type).category === 'work'
}

export function isPipelineArtifactNode(type: string) {
  return getPipelineNodeSpec(type).category === 'artifact'
}

export { ARTIFACT_NODE_TYPES, WORK_NODE_TYPES }

interface PipelineNodeCardProps {
  node: PipelineNode
  depth: number
  selected?: boolean
  expanded?: boolean
  childCount: number
  blockedArtifactNames?: string[]
  onSelect: () => void
  onToggle: () => void
  onEnterWorkspace: () => void
  onAddChild: () => void
  onDelete: () => void
}

export function PipelineNodeComponent({
  node,
  depth,
  selected,
  expanded,
  childCount,
  blockedArtifactNames = [],
  onSelect,
  onToggle,
  onEnterWorkspace,
  onAddChild,
  onDelete,
}: PipelineNodeCardProps) {
  const { t, i18n } = useTranslation()
  const meta = getPipelineNodeMeta(node.type)
  const status = STATUS_META[node.status] ?? STATUS_META.draft
  const Icon = meta.icon
  const typeLabel = t(`pipeline.nodeTypes.${node.type}.label`, { defaultValue: meta.label })
  const categoryLabel = t(`pipeline.categories.${meta.category}`, { defaultValue: meta.category })
  const statusLabel = t(`pipeline.status.${node.status}`, { defaultValue: status.label })
  const isCustomContent = node.content_type === 'custom' || !node.content_type
  const canAddChild = isPipelineWorkNode(node.type)

  return (
    <div
      className={cn(
        'group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 px-3 py-2.5 transition-colors',
        selected ? 'bg-primary/5' : 'hover:bg-muted/40',
      )}
      style={{ paddingLeft: `${12 + depth * 26}px` }}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          className={cn(
            'h-6 w-6 rounded-md flex items-center justify-center shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground',
            childCount === 0 && 'invisible',
          )}
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          title={expanded ? t('common.collapse', { defaultValue: 'Collapse' }) : t('common.expand', { defaultValue: 'Expand' })}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${meta.accent}`}>
          <Icon size={15} className={meta.iconColor} />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{node.name}</p>
            <span className={cn(
              'text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0',
              meta.category === 'work'
                ? 'bg-primary/10 text-primary'
                : meta.category === 'artifact'
                  ? 'bg-muted text-muted-foreground border border-border'
                  : 'bg-muted text-muted-foreground',
            )}>
              {categoryLabel}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground min-w-0">
            <span className="truncate">{typeLabel}</span>
            {node.entity_id && (
              <span className="truncate text-emerald-600">
                {t('pipeline.node.linkedEntity', { type: node.entity_type, id: node.entity_id })}
              </span>
            )}
            {blockedArtifactNames.length > 0 && (
              <span className="truncate text-amber-600">
                {t('pipeline.node.blockedArtifacts', { names: blockedArtifactNames.join(', ') })}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {node.due_date && (
          <span className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarDays size={12} />
            {new Date(node.due_date).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' })}
          </span>
        )}
        {node.assignee && (
          <span className="hidden xl:inline text-xs text-muted-foreground max-w-24 truncate">
            @{node.assignee.username}
          </span>
        )}
        <div className="flex items-center gap-1.5">
          <div className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${status.badge}`}>
            {statusLabel}
          </span>
        </div>
        {!isCustomContent && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100"
            onClick={(e) => { e.stopPropagation(); onEnterWorkspace() }}
            title={t('pipeline.node.enterWorkspace')}
          >
            <ArrowRight size={14} />
          </Button>
        )}
        {canAddChild ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100"
            onClick={(e) => { e.stopPropagation(); onAddChild() }}
            title={t('pipeline.tree.addChild')}
          >
            <Plus size={14} />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100 text-destructive hover:text-destructive"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title={t('common.delete')}
        >
          <Trash2 size={14} />
        </Button>
        <MoreHorizontal size={14} className="text-muted-foreground/50 group-hover:hidden" />
      </div>
    </div>
  )
}
