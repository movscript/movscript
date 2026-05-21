import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { NodeType } from '@/types'
import { CANVAS_NODE_CATALOG, CANVAS_NODE_CATEGORIES } from '../nodeCatalog'
import { Boxes, Trash2 } from 'lucide-react'

const CONTEXT_MENU_NODE_CATEGORIES = CANVAS_NODE_CATEGORIES.filter((category) => category.id !== 'media')
const CONTEXT_MENU_HIDDEN_NODE_TYPES = new Set<NodeType>(['approval'])

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
  const { t } = useTranslation()
  const nodes = CANVAS_NODE_CATALOG.filter((node) => node.category === category && !CONTEXT_MENU_HIDDEN_NODE_TYPES.has(node.type))
  return (
    <>
      <p className="px-3 pt-2 pb-1 type-tiny font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
      {nodes.map(({ type, labelKey, descriptionKey, icon: Icon }) => (
        <button
          key={type}
          onClick={() => { onAdd(type); onClose() }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors text-foreground hover:bg-muted/60"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
            <Icon size={14} />
          </span>
          <span className="min-w-0">
            <span className="block type-label font-medium">{t(labelKey)}</span>
            <span className="block truncate type-tiny text-muted-foreground">{t(descriptionKey)}</span>
          </span>
        </button>
      ))}
    </>
  )
}

export function ContextMenu({ x, y, onAdd, onClose, selectedCount, onGroupSelected, onDeleteSelected, hasSelection }: Props) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })
  const selectedNodeCount = selectedCount ?? 0

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const padding = 8
    setPosition({
      left: Math.min(Math.max(padding, x), window.innerWidth - rect.width - padding),
      top: Math.min(Math.max(padding, y), window.innerHeight - rect.height - padding),
    })
  }, [x, y])

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
      style={{ position: 'fixed', left: position.left, top: position.top, zIndex: 1000, maxHeight: 'calc(100vh - 16px)' }}
      className="bg-popover border border-border rounded-xl shadow-md py-1 w-64 overflow-y-auto"
    >
      {selectedNodeCount >= 2 && onGroupSelected && (
        <>
          <button
            onClick={() => { onGroupSelected(); onClose() }}
            className="w-full flex items-center gap-2.5 px-3 py-2 type-body hover:bg-muted/50 text-left transition-colors text-foreground"
          >
            <Boxes size={14} className="text-muted-foreground" />
            <span>{t('canvas.contextMenu.groupSelected', { count: selectedNodeCount })}</span>
          </button>
          <div className="border-t border-border my-1" />
        </>
      )}
      {hasSelection && onDeleteSelected && (
        <>
          <button
            onClick={() => { onDeleteSelected(); onClose() }}
            className="w-full flex items-center gap-2.5 px-3 py-2 type-body hover:bg-destructive/10 text-left transition-colors text-destructive"
          >
            <Trash2 size={14} />
            <span>{t('canvas.contextMenu.deleteSelected')}</span>
          </button>
          <div className="border-t border-border my-1" />
        </>
      )}
      {CONTEXT_MENU_NODE_CATEGORIES.map((category, index) => (
        <div key={category.id}>
          {index > 0 && <div className="border-t border-border my-1" />}
          <Section title={t(category.titleKey)} category={category.id} onAdd={onAdd} onClose={onClose} />
        </div>
      ))}
    </div>
  )
}
