import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CanvasType, NodeType } from '@/types'
import { CANVAS_NODE_CATALOG, CANVAS_NODE_CATEGORIES } from '@/features/canvas/presentation/nodeCatalog'
import { isPaletteNodeTypeAvailable } from '@/features/canvas/editor/nodeFactory'
import {
  canvasContextMenuPositionFromElement,
  canvasContextMenuStyleFromPosition,
} from '@/features/canvas/presentation/canvasContextMenuPlacement'
import { Boxes, Trash2, Ungroup } from 'lucide-react'
import {
  CanvasContextMenuView,
  type CanvasContextMenuAction,
  type CanvasContextMenuSection,
} from '@movscript/ui'

const CONTEXT_MENU_HIDDEN_NODE_TYPES = new Set<NodeType>(['approval', 'resource_sink', 'canvas'])
const CONTEXT_MENU_MEDIA_NODE_TYPES = new Set<NodeType>(['text'])

interface Props {
  x: number
  y: number
  positioning?: 'fixed' | 'viewport'
  boundary?: { width: number; height: number }
  canvasType: CanvasType
  onAdd: (type: NodeType) => void
  onClose: () => void
  selectedCount?: number
  selectedGroupCount?: number
  onGroupSelected?: () => void
  onUngroupSelected?: () => void
  onDeleteSelected?: () => void
  hasSelection?: boolean
}

export function ContextMenu({
  x,
  y,
  positioning = 'fixed',
  boundary,
  canvasType,
  onAdd,
  onClose,
  selectedCount,
  selectedGroupCount,
  onGroupSelected,
  onUngroupSelected,
  onDeleteSelected,
  hasSelection,
}: Props) {
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
  const sections: CanvasContextMenuSection[] = CANVAS_NODE_CATEGORIES
    .map((category) => ({
      key: category.id,
      title: t(category.titleKey),
      items: CANVAS_NODE_CATALOG
        .filter((node) => (
          node.category === category.id
          && (node.category !== 'media' || CONTEXT_MENU_MEDIA_NODE_TYPES.has(node.type))
          && !CONTEXT_MENU_HIDDEN_NODE_TYPES.has(node.type)
          && isPaletteNodeTypeAvailable(node.type, canvasType)
        ))
        .map(({ type, labelKey, descriptionKey, icon: Icon }) => ({
          key: type,
          icon: <Icon size={14} />,
          label: t(labelKey),
          description: t(descriptionKey),
          onSelect: () => { onAdd(type); onClose() },
        })),
    }))
    .filter((section) => section.items.length > 0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setPosition(canvasContextMenuPositionFromElement({
      element: el,
      x,
      y,
      positioning,
      boundary,
    }))
  }, [boundary?.height, boundary?.width, positioning, x, y])

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
      className={positioning === 'viewport' ? 'canvas-context-menu--viewport' : undefined}
      style={canvasContextMenuStyleFromPosition(position)}
      actions={actions}
      sections={sections}
    />
  )
}
