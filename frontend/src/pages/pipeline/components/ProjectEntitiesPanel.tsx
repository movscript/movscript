import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Film, Clapperboard, Layers, Camera, ChevronDown, ChevronRight, Link2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore } from '@/store/projectStore'
import type { Episode, Scene, Storyboard, Shot } from '@/types'

const STATUS_CHIP: Record<string, string> = {
  // Episode statuses
  draft:          'bg-muted text-muted-foreground',
  scripted:       'bg-blue-100 text-blue-700',
  storyboarded:   'bg-violet-100 text-violet-700',
  generating:     'bg-amber-100 text-amber-700',
  editing:        'bg-orange-100 text-orange-700',
  done:           'bg-green-100 text-green-700',
  // Storyboard
  approved:       'bg-green-100 text-green-700',
  // Shot
  prompt_ready:   'bg-blue-100 text-blue-700',
  generated:      'bg-violet-100 text-violet-700',
}

function SectionHeader({ icon: Icon, label, count, open, onToggle }: {
  icon: React.ElementType
  label: string
  count: number
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 transition-colors text-left"
      onClick={onToggle}
    >
      <Icon size={13} className="text-muted-foreground shrink-0" />
      <span className="text-xs font-semibold text-foreground flex-1">{label}</span>
      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">{count}</span>
      {open ? <ChevronDown size={12} className="text-muted-foreground shrink-0" /> : <ChevronRight size={12} className="text-muted-foreground shrink-0" />}
    </button>
  )
}

interface EntityCardProps {
  title: string
  subtitle?: string
  status?: string
  onLinkClick?: () => void
}

function EntityCard({ title, subtitle, status, onLinkClick }: EntityCardProps) {
  return (
    <div className="mx-2 mb-1 px-2.5 py-2 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors group">
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate">{title}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground truncate">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {status && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_CHIP[status] ?? 'bg-muted text-muted-foreground'}`}>
              {status}
            </span>
          )}
          {onLinkClick && (
            <button
              onClick={onLinkClick}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-muted-foreground hover:text-primary"
              title="关联到节点"
            >
              <Link2 size={11} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

interface Props {
  /** If provided, clicking the link icon will call this with entity info */
  onLinkEntity?: (entityType: string, entityId: number, entityLabel: string) => void
}

export function ProjectEntitiesPanel({ onLinkEntity }: Props) {
  const project = useProjectStore((s) => s.current)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    episodes: true, scenes: false, storyboards: false, shots: false,
  })

  function toggle(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const { data: episodes = [] } = useQuery<Episode[]>({
    queryKey: ['episodes', project?.ID],
    queryFn: () => api.get(`/projects/${project!.ID}/episodes`).then((r) => r.data),
    enabled: !!project,
  })

  const { data: scenes = [] } = useQuery<Scene[]>({
    queryKey: ['scenes', project?.ID],
    queryFn: () => api.get(`/projects/${project!.ID}/scenes`).then((r) => r.data),
    enabled: !!project,
  })

  const { data: storyboards = [] } = useQuery<Storyboard[]>({
    queryKey: ['storyboards', project?.ID],
    queryFn: () => api.get(`/projects/${project!.ID}/storyboards`).then((r) => r.data),
    enabled: !!project,
  })

  const { data: shots = [] } = useQuery<Shot[]>({
    queryKey: ['shots', project?.ID],
    queryFn: () => api.get(`/projects/${project!.ID}/shots`).then((r) => r.data),
    enabled: !!project,
  })

  return (
    <div className="w-60 border-l border-border bg-card flex flex-col shrink-0 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border shrink-0">
        <p className="text-xs font-semibold text-foreground">项目内容</p>
        <p className="text-[10px] text-muted-foreground">点击链接图标关联到节点</p>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* Episodes */}
        <div>
          <SectionHeader
            icon={Film}
            label="分集"
            count={episodes.length}
            open={openSections.episodes}
            onToggle={() => toggle('episodes')}
          />
          {openSections.episodes && (
            <div className="pb-1">
              {episodes.length === 0 ? (
                <p className="px-3 py-1.5 text-[10px] text-muted-foreground">暂无分集</p>
              ) : episodes.map((e) => (
                <EntityCard
                  key={e.ID}
                  title={`第 ${e.number} 集${e.title ? ` · ${e.title}` : ''}`}
                  subtitle={e.synopsis}
                  status={e.status}
                  onLinkClick={onLinkEntity ? () => onLinkEntity('episode', e.ID, `第${e.number}集`) : undefined}
                />
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border/50" />

        {/* Scenes */}
        <div>
          <SectionHeader
            icon={Clapperboard}
            label="分场"
            count={scenes.length}
            open={openSections.scenes}
            onToggle={() => toggle('scenes')}
          />
          {openSections.scenes && (
            <div className="pb-1">
              {scenes.length === 0 ? (
                <p className="px-3 py-1.5 text-[10px] text-muted-foreground">暂无分场</p>
              ) : scenes.map((s) => (
                <EntityCard
                  key={s.ID}
                  title={`场景 ${s.number}${s.title ? ` · ${s.title}` : ''}`}
                  subtitle={s.location}
                  onLinkClick={onLinkEntity ? () => onLinkEntity('scene', s.ID, `场景${s.number}`) : undefined}
                />
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border/50" />

        {/* Storyboards */}
        <div>
          <SectionHeader
            icon={Layers}
            label="分镜"
            count={storyboards.length}
            open={openSections.storyboards}
            onToggle={() => toggle('storyboards')}
          />
          {openSections.storyboards && (
            <div className="pb-1">
              {storyboards.length === 0 ? (
                <p className="px-3 py-1.5 text-[10px] text-muted-foreground">暂无分镜</p>
              ) : storyboards.map((sb) => (
                <EntityCard
                  key={sb.ID}
                  title={sb.title || `分镜 ${sb.order}`}
                  subtitle={sb.description}
                  status={sb.status}
                  onLinkClick={onLinkEntity ? () => onLinkEntity('storyboard', sb.ID, sb.title || `分镜${sb.order}`) : undefined}
                />
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border/50" />

        {/* Shots */}
        <div>
          <SectionHeader
            icon={Camera}
            label="镜头"
            count={shots.length}
            open={openSections.shots}
            onToggle={() => toggle('shots')}
          />
          {openSections.shots && (
            <div className="pb-1">
              {shots.length === 0 ? (
                <p className="px-3 py-1.5 text-[10px] text-muted-foreground">暂无镜头</p>
              ) : shots.map((sh) => (
                <EntityCard
                  key={sh.ID}
                  title={`镜头 ${sh.order}`}
                  subtitle={sh.description}
                  status={sh.status}
                  onLinkClick={onLinkEntity ? () => onLinkEntity('shot', sh.ID, `镜头${sh.order}`) : undefined}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
