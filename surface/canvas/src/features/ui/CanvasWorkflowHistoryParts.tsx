import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from '@movscript/ui/primitives';
import { Badge, Button, NativeSelect, StatusBadge, type ButtonProps, type NativeSelectProps, type StatusIntent } from "@movscript/ui/primitives";
import type { CanvasWorkflowRunStatus } from "./CanvasWorkflowHistoryTypes";

type DivAttributesWithoutTitle = Omit<HTMLAttributes<HTMLDivElement>, "title">;

type CanvasWorkflowHistoryHeaderProps = DivAttributesWithoutTitle & {
  compact?: boolean;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

function runStatusIntent(status: CanvasWorkflowRunStatus): StatusIntent {
  if (status === "done") return "success";
  if (status === "failed") return "danger";
  return "neutral";
}

export function CanvasRunStatusBadge({
  status,
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  status: CanvasWorkflowRunStatus;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const loading = status === "running" || status === "pending";
  if (loading) {
    return (
      <Badge data-loading="true" className={cn("canvas-run-status-badge", className)} {...props}>
        {icon ? <span className="canvas-run-status-badge__icon">{icon}</span> : null}
        {children}
      </Badge>
    );
  }
  return (
    <StatusBadge intent={runStatusIntent(status)} className={cn("canvas-run-status-badge", className)} {...props}>
      {icon ? <span className="canvas-run-status-badge__icon">{icon}</span> : null}
      {children}
    </StatusBadge>
  );
}

export function CanvasWorkflowHistoryPanel({
  embedded = false,
  compact = false,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  embedded?: boolean;
  compact?: boolean;
}) {
  return (
    <section
      data-embedded={embedded ? "true" : undefined}
      data-compact={compact ? "true" : undefined}
      className={cn("canvas-workflow-history", className)}
      {...props}
    />
  );
}

export function CanvasWorkflowHistoryHeader({
  compact = false,
  icon,
  title,
  description,
  actions,
  className,
  ...props
}: CanvasWorkflowHistoryHeaderProps) {
  return (
    <div data-compact={compact ? "true" : undefined} className={cn("canvas-workflow-history__header", className)} {...props}>
      <div className="canvas-workflow-history__title-row">
        {icon ? <span className="canvas-workflow-history__header-icon">{icon}</span> : null}
        <span className="canvas-workflow-history__title-body">
          <span className="canvas-workflow-history__title">{title}</span>
          {description ? <span className="canvas-workflow-history__description">{description}</span> : null}
        </span>
      </div>
      {actions ? <div className="canvas-workflow-history__actions">{actions}</div> : null}
    </div>
  );
}

export function CanvasWorkflowHistoryControls({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-history__controls", className)} {...props} />;
}

export const CanvasWorkflowHistorySelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, ...props }, ref) => (
    <NativeSelect ref={ref} className={cn("canvas-workflow-history__select", className)} {...props} />
  )
);

CanvasWorkflowHistorySelect.displayName = "CanvasWorkflowHistorySelect";

export const CanvasWorkflowHistoryPageButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "outline", size = "sm", ...props }, ref) => (
    <Button ref={ref} variant={variant} size={size} className={cn("canvas-workflow-history__page-button", className)} {...props} />
  )
);

CanvasWorkflowHistoryPageButton.displayName = "CanvasWorkflowHistoryPageButton";

export function CanvasWorkflowHistoryPageIndicator({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
}) {
  return (
    <span className={cn("canvas-workflow-history__page-indicator", className)} {...props}>
      {children}
    </span>
  );
}

export function CanvasWorkflowHistoryDuration({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className={cn("canvas-workflow-history-duration", className)} {...props}>
      {icon ? <span className="canvas-workflow-history-duration__icon">{icon}</span> : null}
      <span className="canvas-workflow-history-duration__label">{children}</span>
    </span>
  );
}

export function CanvasWorkflowHistoryBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-history__body", className)} {...props} />;
}

export function CanvasWorkflowHistoryState({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("canvas-workflow-history__state", className)} {...props}>
      {icon ? <span className="canvas-workflow-history__state-icon">{icon}</span> : null}
      {children}
    </div>
  );
}
