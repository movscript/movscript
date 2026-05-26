import type { FormEventHandler, HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { AppSurfaceItem } from "../../../app";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../../primitives";

export function DetailEntityDialogShell({
  open,
  onOpenChange,
  quickCreate = false,
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quickCreate?: boolean;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("detail-entity-dialog", quickCreate && "detail-entity-dialog--quick")}>
        <form onSubmit={onSubmit} className="detail-entity-dialog__form">
          {children}
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DetailEntityDialogHeader({
  quickCreate = false,
  icon,
  title,
  description,
}: {
  quickCreate?: boolean;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
}) {
  const content = (
    <>
      {icon ? (
        <AppSurfaceItem className="detail-entity-dialog-header__icon">
          {icon}
        </AppSurfaceItem>
      ) : null}
      <div className="detail-entity-dialog-header__copy">
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription className="detail-entity-dialog-header__description">{description}</DialogDescription> : null}
      </div>
    </>
  );

  return (
    <DialogHeader>
      {quickCreate ? (
        <AppSurfaceItem variant="muted" className="detail-entity-dialog-header detail-entity-dialog-header--quick">
          {content}
        </AppSurfaceItem>
      ) : (
        <div className="detail-entity-dialog-header">
          {content}
        </div>
      )}
    </DialogHeader>
  );
}

export function DetailEntityDialogBody({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("detail-entity-dialog__body", className)} {...props}>
      {children}
    </div>
  );
}

export function DetailEntityDialogFooter({
  mode,
  canDelete,
  deleteLabel,
  cancelLabel,
  submitLabel,
  deleteIcon,
  deleting,
  saving,
  immutable,
  onDelete,
  onCancel,
}: {
  mode: "create" | "edit";
  canDelete?: boolean;
  deleteLabel: ReactNode;
  cancelLabel: ReactNode;
  submitLabel: ReactNode;
  deleteIcon?: ReactNode;
  deleting?: boolean;
  saving?: boolean;
  immutable?: boolean;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  return (
    <DialogFooter className="detail-entity-dialog__footer">
      {mode === "edit" && canDelete ? (
        <Button type="button" variant="solid" tone="danger" onClick={onDelete} loading={deleting} className="detail-entity-dialog__delete">
          {deleteIcon}
          {deleteLabel}
        </Button>
      ) : null}
      <Button type="button" variant="outline" onClick={onCancel}>{cancelLabel}</Button>
      {immutable ? null : <Button type="submit" loading={saving}>{submitLabel}</Button>}
    </DialogFooter>
  );
}
