import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { NodeType } from '@/types'
import { CANVAS_NODE_CATALOG, CANVAS_NODE_CATEGORIES } from '@/features/canvas/presentation/nodeCatalog'
import { Boxes, Trash2, Ungroup } from 'lucide-react'
import {
  CanvasContextMenuView,
  type CanvasContextMenuAction,
  type CanvasContextMenuSection,
} from '@movscript/ui'

const CONTEXT_MENU_NODE_CATEGORIES = CANVAS_NODE_CATEGORIES.filter((category) => category.id !== 'media')
const CONTEXT_MENU_HIDDEN_NODE_TYPES = new Set<NodeType>(['approval'])

interface Props {
  x: number
  y: number
  onAdd: (type: NodeType) => void
  onClose: () => void
  selectedCount?: number
  selectedGroupCount?: number
  onGroupSelected?: () => void
  onUngroupSelected?: () => void
  onDeleteSelected?: () => void
  hasSelection?: boolean
}

export function ContextMenu({ x, y, onAdd, onClose, selectedCount, selectedGroupCount, onGroupSelected, onUngroupSelected, onDeleteSelected, hasSelection }: Props) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })
  const selectedNodeCount = selectedCount ?? 0
  const groupCount = selectedGroupCount ?? 0
  const actions: CanvasContextMenuAction[] = [
    ...(selectedNodeCount >= 2 && onGroupSelected
      ? [{
          key: 'group-selected',
          icon: <Boxes size={14} />,
          label: t('canvas.contextMenu.groupSelected', { count: selectedNodeCount }),
          onSelect: () => { onGroupSelected(); onClose() },
        }]
      : []),
    ...(groupCount > 0 && onUngroupSelected
      ? [{
          key: 'ungroup-selected',
          icon: <Ungroup size={14} />,
          label: t('canvas.contextMenu.ungroupSelected', { count: groupCount }),
          onSelect: () => { onUngroupSelected(); onClose() },
        }]
      : []),
    ...(hasSelection && onDeleteSelected
      ? [{
          key: 'delete-selected',
          tone: 'danger' as const,
          icon: <Trash2 size={14} />,
          label: t('canvas.contextMenu.deleteSelected'),
          onSelect: () => { onDeleteSelected(); onClose() },
        }]
      : []),
  ]
  const sections: CanvasContextMenuSection[] = CONTEXT_MENU_NODE_CATEGORIES.map((category) => ({
    key: category.id,
    title: t(category.titleKey),
    items: CANVAS_NODE_CATALOG
      .filter((node) => node.category === category.id && !CONTEXT_MENU_HIDDEN_NODE_TYPES.has(node.type))
      .map(({ type, labelKey, descriptionKey, icon: Icon }) => ({
        key: type,
        icon: <Icon size={14} />,
        label: t(labelKey),
        description: t(descriptionKey),
        onSelect: () => { onAdd(type); onClose() },
      })),
  }))

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
    <CanvasContextMenuView
      ref={ref}
      style={{ left: position.left, top: position.top }}
      actions={actions}
      sections={sections}
    />
  )
}
