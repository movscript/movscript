import { ArrowRight, Check, Pencil, Trash2, X } from 'lucide-react'

import {
  CanvasListItem,
  CanvasListItemActionButton,
  CanvasListItemActions,
  CanvasListItemBody,
  CanvasListItemIcon,
  CanvasListItemMeta,
  CanvasListItemName,
  CanvasListItemNameInput,
  CanvasListTypeBadge,
} from './CanvasListUi'
import {
  CANVAS_LIST_TYPE_META,
  type CanvasListTranslate,
} from './CanvasListViewModel'

import type { CanvasRouteSource } from '@/routes/appRouteModel'
import type { Canvas } from '@/types'

interface CanvasListRowProps {
  canvas: Canvas
  source: CanvasRouteSource
  editing: boolean
  editingName: string
  renamePending: boolean
  removePending: boolean
  onOpen: (canvas: Canvas) => void
  onStartRename: (canvas: Canvas) => void
  onEditingNameChange: (value: string) => void
  onSubmitRename: (id: number) => void
  onCancelRename: () => void
  onRemove: (id: number) => void
  t: CanvasListTranslate
}

export function CanvasListRow({
  canvas,
  source,
  editing,
  editingName,
  renamePending,
  removePending,
  onOpen,
  onStartRename,
  onEditingNameChange,
  onSubmitRename,
  onCancelRename,
  onRemove,
  t,
}: CanvasListRowProps) {
  const type = canvas.canvas_type ?? 'inspiration'
  const meta = CANVAS_LIST_TYPE_META[type]

  return (
    <CanvasListItem>
      <CanvasListItemIcon data-canvas-type={type}>
        {meta.listIcon}
      </CanvasListItemIcon>
      <CanvasListItemBody>
        {editing ? (
          <CanvasListItemNameInput
            autoFocus
            value={editingName}
            onChange={(event) => onEditingNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSubmitRename(canvas.ID)
              if (event.key === 'Escape') onCancelRename()
            }}
          />
        ) : (
          <>
            <CanvasListItemName>{canvas.name}</CanvasListItemName>
            {source === 'agent' ? (
              <CanvasListItemMeta>#{canvas.ID}</CanvasListItemMeta>
            ) : null}
          </>
        )}
      </CanvasListItemBody>
      <CanvasListTypeBadge icon={meta.icon}>{t(meta.labelKey)}</CanvasListTypeBadge>
      {editing ? (
        <CanvasListItemActions>
          <CanvasListItemActionButton
            variant="outline"
            size="icon"
            onClick={() => onSubmitRename(canvas.ID)}
            disabled={!editingName.trim() || renamePending}
            aria-label={t('pages.canvases.renameConfirm')}
          >
            <Check size={14} />
          </CanvasListItemActionButton>
          <CanvasListItemActionButton
            variant="ghost"
            size="icon"
            onClick={onCancelRename}
            aria-label={t('common.cancel')}
            muted
          >
            <X size={14} />
          </CanvasListItemActionButton>
        </CanvasListItemActions>
      ) : (
        <CanvasListItemActions>
          <CanvasListItemActionButton
            variant="outline"
            size="sm"
            onClick={() => onOpen(canvas)}
          >
            {t('pages.canvases.open')} <ArrowRight size={14} />
          </CanvasListItemActionButton>
          <CanvasListItemActionButton
            variant="ghost"
            size="icon"
            onClick={() => onStartRename(canvas)}
            aria-label={t('pages.canvases.rename')}
            muted
          >
            <Pencil size={14} />
          </CanvasListItemActionButton>
          <CanvasListItemActionButton
            variant="ghost"
            tone="danger"
            size="icon"
            onClick={() => onRemove(canvas.ID)}
            disabled={removePending}
            aria-label={t('common.delete')}
          >
            <Trash2 size={14} />
          </CanvasListItemActionButton>
        </CanvasListItemActions>
      )}
    </CanvasListItem>
  )
}
