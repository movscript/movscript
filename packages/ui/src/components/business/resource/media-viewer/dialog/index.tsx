import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { AppMediaFrame, AppSurfaceItem } from "../../../app";
import { Button } from "../../../../primitives/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "../../../../primitives/dialog";

export function ResourceMediaDialog({
  open,
  onOpenChange,
  name,
  metadata,
  sidePanel,
  children,
  downloadLabel,
  closeLabel,
  downloadIcon,
  closeIcon,
  onDownload,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  name: ReactNode;
  metadata?: ReactNode;
  sidePanel?: ReactNode;
  children: ReactNode;
  downloadLabel: string;
  closeLabel: string;
  downloadIcon: ReactNode;
  closeIcon: ReactNode;
  onDownload: () => void;
}) {
  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="resource-media-dialog__overlay" />
        <DialogContent hideClose className="ms-center resource-media-dialog__content">
          <AppSurfaceItem className={cn("ms-stack resource-media-dialog", !sidePanel && "resource-media-dialog--compact")}>
            <div className="ms-action-row resource-media-dialog__header">
              <div className="resource-media-dialog__title-block">
                <DialogTitle className="ms-text-truncate ms-type-body resource-media-dialog__title">{name}</DialogTitle>
                {metadata ? <div className="resource-media-dialog__metadata">{metadata}</div> : null}
              </div>
              <div className="ms-action-row resource-media-dialog__actions">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={onDownload}
                  title={downloadLabel}
                  aria-label={downloadLabel}
                >
                  {downloadIcon}
                </Button>
                <DialogClose asChild>
                  <Button type="button" size="icon" variant="ghost" aria-label={closeLabel}>
                    {closeIcon}
                  </Button>
                </DialogClose>
              </div>
            </div>

            <div data-side-panel={sidePanel ? "true" : "false"} className="resource-media-dialog__body">
              <ResourceMediaStage>{children}</ResourceMediaStage>
              {sidePanel ? (
                <AppSurfaceItem className="resource-media-dialog__side-panel">
                  {sidePanel}
                </AppSurfaceItem>
              ) : null}
            </div>
          </AppSurfaceItem>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

export function ResourceMediaStage({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <AppMediaFrame variant="stage" className={cn("ms-center resource-media-stage", className)} {...props}>
      {children}
    </AppMediaFrame>
  );
}
