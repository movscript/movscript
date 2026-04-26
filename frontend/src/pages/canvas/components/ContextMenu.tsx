import { useEffect, useRef } from 'react'
import type { NodeType } from '@/types'
import { CANVAS_NODE_CATALOG, CANVAS_NODE_CATEGORIES } from '../nodeCatalog'
import { Boxes, Trash2 } from 'lucide-react'

interface Props {
  x: number
  y: number
  onAdd: (type: NodeType) => void
  onClose: () => void
  selectedCount?: number
  onGroupSelected?: () => void
  onDeleteSelected?: () => void
  hasSelection?: boolean
}

function Section({
  title,
  category,
  onAdd,
  onClose,
}: {
  title: string
  category: string
  onAdd: (t: NodeType) => void
  onClose: () => void
}) {
  const nodes = CANVAS_NODE_CATALOG.filter((node) => node.category === category)
  return (
    <>
      <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
      {nodes.map(({ type, label, description, icon: Icon }) => (
        <button
          key={type}
          onClick={() => { onAdd(type); onClose() }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors text-foreground hover:bg-muted/60"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
            <Icon size={14} />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-medium">{label}</span>
            <span className="block truncate text-[10px] text-muted-foreground">{description}</span>
          </span>
        </button>
      ))}
    </>
  )
}

export function ContextMenu({ x, y, onAdd, onClose, selectedCount, onGroupSelected, onDeleteSelected, hasSelection }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const selectedNodeCount = selectedCount ?? 0

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: x, top: y, zIndex: 1000 }}
      className="bg-popover border border-border rounded-xl shadow-md py-1 w-64"
    >
      {selectedNodeCount >= 2 && onGroupSelected && (
        <>
          <button
            onClick={() => { onGroupSelected(); onClose() }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50 text-left transition-colors text-foreground"
          >
            <Boxes size={14} className="text-muted-foreground" />
            <span>将 {selectedNodeCount} 个节点分组</span>
          </button>
          <div className="border-t border-border my-1" />
        </>
      )}
      {hasSelection && onDeleteSelected && (
        <>
          <button
            onClick={() => { onDeleteSelected(); onClose() }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-destructive/10 text-left transition-colors text-destructive"
          >
            <Trash2 size={14} />
            <span>删除选中节点</span>
          </button>
          <div className="border-t border-border my-1" />
        </>
      )}
      {CANVAS_NODE_CATEGORIES.map((category, index) => (
        <div key={category.id}>
          {index > 0 && <div className="border-t border-border my-1" />}
          <Section title={category.title} category={category.id} onAdd={onAdd} onClose={onClose} />
        </div>
      ))}
    </div>
  )
}
