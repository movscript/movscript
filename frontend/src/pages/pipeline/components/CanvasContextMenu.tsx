import { useEffect, useRef } from 'react'
import { NODE_TYPE_META, type NodeCategory } from './PipelineNodeComponent'
import { useTranslation } from 'react-i18next'

// ── Node type definitions (ordered for display) ───────────────────────────────

const WORK_NODES = [
  'script_writing',
  'episode_writing',
  'scene_writing',
  'storyboard_creation',
  'asset_creation',
  'shot_production',
  'episode_edit',
  'raw_script',
]

const ARTIFACT_NODES = [
  'main_script',
  'episode',
  'scene',
  'storyboard',
  'asset',
]

const TOOL_NODES = [
  'ref_image_gen',
  'ref_video_gen',
  'style_transfer',
  'motion_imitation',
  'multi_angle',
]

export { NODE_TYPE_META }

// ── Context menu ──────────────────────────────────────────────────────────────

interface Props {
  x: number
  y: number
  onSelect: (type: string, label: string) => void
  onClose: () => void
}

function NodeTypeRow({
  type,
  onSelect,
  onClose,
}: {
  type: string
  onSelect: (type: string, label: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const meta = NODE_TYPE_META[type]
  if (!meta) return null
  const Icon = meta.icon
  const label = t(`pipeline.nodeTypes.${type}.label`, { defaultValue: meta.label })
  const desc = meta.desc ? t(`pipeline.nodeTypes.${type}.desc`, { defaultValue: meta.desc }) : undefined

  return (
    <button
      className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-accent transition-colors text-left"
      onClick={() => { onSelect(type, label); onClose() }}
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${meta.accent}`}>
        {meta.toolEmoji
          ? <span className="text-sm">{meta.toolEmoji}</span>
          : <Icon size={13} className={meta.iconColor} />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground leading-tight">{label}</p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
    </button>
  )
}

function SectionLabel({ category }: { category: NodeCategory }) {
  const { t } = useTranslation()
  const map: Record<NodeCategory, { label: string; cls: string }> = {
    work:     { label: t('pipeline.categories.workNodes'), cls: 'text-primary' },
    artifact: { label: t('pipeline.categories.artifactNodes'), cls: 'text-muted-foreground' },
    tool:     { label: t('pipeline.categories.toolNodes'), cls: 'text-violet-600' },
    custom:   { label: t('pipeline.categories.custom'),   cls: 'text-muted-foreground' },
  }
  const { label, cls } = map[category]
  return (
    <p className={`px-2.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest ${cls}`}>
      {label}
    </p>
  )
}

export function CanvasContextMenu({ x, y, onSelect, onClose }: Props) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  const menuW = 280
  const menuH = 620
  const safeX = Math.min(x, window.innerWidth - menuW - 8)
  const safeY = Math.min(y, window.innerHeight - menuH - 8)

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-card border border-border rounded-xl shadow-xl overflow-hidden"
      style={{ left: safeX, top: safeY, width: menuW }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 py-2.5 border-b border-border">
        <p className="text-xs font-semibold text-foreground">{t('pipeline.contextMenu.addNode')}</p>
        <p className="text-[10px] text-muted-foreground">{t('pipeline.contextMenu.hint')}</p>
      </div>

      <div className="max-h-[560px] overflow-y-auto p-1.5">
        {/* Work nodes */}
        <SectionLabel category="work" />
        {WORK_NODES.map((type) => (
          <NodeTypeRow key={type} type={type} onSelect={onSelect} onClose={onClose} />
        ))}

        <div className="border-t border-border/50 my-1.5 mx-1" />

        {/* Artifact nodes */}
        <SectionLabel category="artifact" />
        {ARTIFACT_NODES.map((type) => (
          <NodeTypeRow key={type} type={type} onSelect={onSelect} onClose={onClose} />
        ))}

        <div className="border-t border-border/50 my-1.5 mx-1" />

        {/* Tool nodes */}
        <SectionLabel category="tool" />
        {TOOL_NODES.map((type) => (
          <NodeTypeRow key={type} type={type} onSelect={onSelect} onClose={onClose} />
        ))}

        <div className="border-t border-border/50 my-1.5 mx-1" />

        {/* Custom */}
        <NodeTypeRow type="custom" onSelect={onSelect} onClose={onClose} />
      </div>
    </div>
  )
}
