import type { ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../../primitives/dialog";
import { AppTextEmptyState } from "../../../app";

export type ContentWorkbenchDialogWidth = "md" | "lg";

export function ContentWorkbenchDialogFrame({
  open,
  onOpenChange,
  title,
  description,
  children,
  width = "md",
  contentClassName,
  bodyClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  width?: ContentWorkbenchDialogWidth;
  contentClassName?: string;
  bodyClassName?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("content-workbench-dialog", `content-workbench-dialog--${width}`, contentClassName)}>
        <DialogHeader className="content-workbench-dialog__header">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className={cn("content-workbench-dialog__body", bodyClassName)}>{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export function ContentWorkbenchDialogEmptyState({ children }: { children: ReactNode }) {
  return <AppTextEmptyState>{children}</AppTextEmptyState>;
}
