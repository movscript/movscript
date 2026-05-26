import type { ReactNode } from "react";

import { cn } from "../../../../../../lib/cn";
import { Button } from "../../../../../primitives";
import type { DetailEntityEditorActionIcons } from "../../types";

export function DetailEntityEditorActions({
  mode,
  canCollapse = false,
  collapsed = false,
  collapsedMode = "vertical",
  canEdit = true,
  canDelete = false,
  canSave = true,
  deleting = false,
  saving = false,
  disabled = false,
  overlay = false,
  formId,
  icons = {},
  collapseLabel,
  expandLabel = "展开",
  editLabel = "编辑",
  deleteLabel = "删除",
  cancelLabel = "取消",
  saveLabel = "保存",
  onToggleCollapsed,
  onEdit,
  onDelete,
  onCancel,
  className,
}: {
  mode: "view" | "edit";
  canCollapse?: boolean;
  collapsed?: boolean;
  collapsedMode?: "vertical" | "horizontal";
  canEdit?: boolean;
  canDelete?: boolean;
  canSave?: boolean;
  deleting?: boolean;
  saving?: boolean;
  disabled?: boolean;
  overlay?: boolean;
  formId?: string;
  icons?: DetailEntityEditorActionIcons;
  collapseLabel?: ReactNode;
  expandLabel?: ReactNode;
  editLabel?: ReactNode;
  deleteLabel?: ReactNode;
  cancelLabel?: ReactNode;
  saveLabel?: ReactNode;
  onToggleCollapsed?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCancel?: () => void;
  className?: string;
}) {
  const collapseIcon = collapsed ? icons.expand : collapsedMode === "horizontal" ? icons.expand : icons.collapse;
  const toggleLabel = collapsed ? expandLabel : collapseLabel ?? "收起";

  return (
    <div className={cn("detail-entity-editor-actions", overlay && "detail-entity-editor-actions--overlay", className)}>
      {canCollapse ? (
        <Button type="button" size="sm" variant="outline" className="detail-entity-editor-actions__secondary" onClick={onToggleCollapsed}>
          {collapseIcon}
          {toggleLabel}
        </Button>
      ) : null}
      {mode === "view" ? (
        <>
          {canEdit ? (
            <Button size="sm" variant="outline" className="detail-entity-editor-actions__secondary" onClick={onEdit} disabled={disabled || deleting}>
              {icons.edit}
              {editLabel}
            </Button>
          ) : null}
          {canDelete ? (
            <Button type="button" size="sm" variant="solid" tone="danger" onClick={onDelete} loading={deleting}>
              {icons.delete}
              {deleteLabel}
            </Button>
          ) : null}
        </>
      ) : (
        <>
          {canDelete ? (
            <Button type="button" size="sm" variant="solid" tone="danger" onClick={onDelete} loading={deleting}>
              {icons.delete}
              {deleteLabel}
            </Button>
          ) : null}
          {onCancel ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="detail-entity-editor-actions__secondary"
              onClick={onCancel}
              disabled={disabled || saving || deleting}
            >
              {icons.cancel}
              {cancelLabel}
            </Button>
          ) : null}
          <Button
            type="submit"
            form={formId}
            size="sm"
            loading={saving}
            disabled={!canSave || disabled || deleting}
          >
            {icons.save}
            {saveLabel}
          </Button>
        </>
      )}
    </div>
  );
}
