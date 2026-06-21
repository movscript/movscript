import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/shared/ui/cn";
import { AppChoiceTile, AppMarkerDot, AppSurfaceItem } from "@movscript/ui/business/app";
import { Button, type ButtonProps } from "@movscript/ui/primitives";

export function CanvasWorkflowHistoryCompactList({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-history__compact-list", className)} {...props} />;
}

export const CanvasWorkflowHistoryCompactItem = forwardRef<HTMLButtonElement, ButtonProps & {
  selected?: boolean;
  runLabel: ReactNode;
  status: ReactNode;
  startedAt: ReactNode;
  duration: ReactNode;
  snapshot: ReactNode;
  error?: ReactNode;
}>(({ selected = false, runLabel, status, startedAt, duration, snapshot, error, className, ...props }, ref) => (
  <AppChoiceTile
    ref={ref}
    selected={selected}
    variant={selected ? "soft" : "ghost"}
    className={cn("canvas-workflow-history-compact-item", className)}
    {...props}
  >
    <span className="canvas-workflow-history-compact-item__header">
      <span className="canvas-workflow-history-compact-item__run">{runLabel}</span>
      {status}
      <span className="canvas-workflow-history-compact-item__time">{startedAt}</span>
    </span>
    <span className="canvas-workflow-history-compact-item__meta">
      <span className="canvas-workflow-history-compact-item__duration">{duration}</span>
      <AppMarkerDot tone="border" size="2xs" />
      <span className="canvas-workflow-history-compact-item__snapshot">{snapshot}</span>
    </span>
    {error ? <span className="canvas-workflow-history-compact-item__error" title={String(error)}>{error}</span> : null}
  </AppChoiceTile>
));

CanvasWorkflowHistoryCompactItem.displayName = "CanvasWorkflowHistoryCompactItem";

export function CanvasWorkflowHistoryTable({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-history-table", className)} {...props} />;
}

export function CanvasWorkflowHistoryTableHeader({
  run,
  status,
  duration,
  snapshot,
  startedAt,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  run: ReactNode;
  status: ReactNode;
  duration: ReactNode;
  snapshot: ReactNode;
  startedAt: ReactNode;
}) {
  return (
    <AppSurfaceItem variant="muted" className={cn("canvas-workflow-history-table__header", className)} {...props}>
      <span>{run}</span>
      <span>{status}</span>
      <span>{duration}</span>
      <span>{snapshot}</span>
      <span className="canvas-workflow-history-table__right">{startedAt}</span>
    </AppSurfaceItem>
  );
}

export const CanvasWorkflowHistoryTableRow = forwardRef<HTMLButtonElement, ButtonProps & {
  selected?: boolean;
  runLabel: ReactNode;
  status: ReactNode;
  duration: ReactNode;
  snapshot: ReactNode;
  error?: ReactNode;
  startedAt: ReactNode;
}>(({ selected = false, runLabel, status, duration, snapshot, error, startedAt, className, ...props }, ref) => (
  <Button
    ref={ref}
    type="button"
    variant="ghost"
    data-selected={selected ? "true" : undefined}
    className={cn("canvas-workflow-history-table__row", className)}
    {...props}
  >
    <span className="canvas-workflow-history-table__row-content">
      <span className="canvas-workflow-history-table__run">{runLabel}</span>
      {status}
      <span className="canvas-workflow-history-table__duration">{duration}</span>
      <span className="canvas-workflow-history-table__snapshot" title={error ? String(error) : undefined}>
        {snapshot}
        {error ? <span className="canvas-workflow-history-table__error">{error}</span> : null}
      </span>
      <span className="canvas-workflow-history-table__time">{startedAt}</span>
    </span>
  </Button>
));

CanvasWorkflowHistoryTableRow.displayName = "CanvasWorkflowHistoryTableRow";
