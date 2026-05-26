import type { HTMLAttributes, MouseEventHandler, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { StatusBadge, type StatusBadgeProps } from "../../../../primitives/badge";
import { Button } from "../../../../primitives/button";
import { AppInlineMeta, AppSurfaceItem } from "../../../app";

export function CanvasToolFullHistoryItem({
  statusLabel,
  statusProps,
  timestamp,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  statusLabel: ReactNode;
  statusProps?: StatusBadgeProps;
  timestamp?: ReactNode;
}) {
  const { className: statusClassName, ...statusVisualProps } = statusProps ?? {};

  return (
    <AppSurfaceItem variant="muted" className={cn("canvas-tool-full-history-item", className)} {...props}>
      <div className="canvas-tool-full-history-item__header">
        <StatusBadge className={cn("canvas-tool-full-history-item__status", statusClassName)} {...statusVisualProps}>
          {statusLabel}
        </StatusBadge>
        {timestamp ? <span className="canvas-tool-full-history-item__timestamp">{timestamp}</span> : null}
      </div>
      {children}
    </AppSurfaceItem>
  );
}

export function CanvasToolFullHistorySection({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("canvas-tool-full-history", className)} {...props}>
      {children}
    </div>
  );
}

export function CanvasToolFullHistoryToggle({
  label,
  count,
  expandedIcon,
  collapsedIcon,
  expanded,
  onMouseDown,
  onClick,
}: {
  label: ReactNode;
  count: ReactNode;
  expandedIcon?: ReactNode;
  collapsedIcon?: ReactNode;
  expanded?: boolean;
  onMouseDown?: MouseEventHandler<HTMLButtonElement>;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onMouseDown={onMouseDown}
      onClick={onClick}
      className="canvas-tool-full-history__toggle"
    >
      <span className="canvas-tool-full-history__toggle-label">
        {label}
        <AppInlineMeta className="canvas-tool-full-history__count">{count}</AppInlineMeta>
      </span>
      {expanded ? expandedIcon : collapsedIcon}
    </Button>
  );
}

export function CanvasToolFullHistoryList({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("canvas-tool-full-history__list nowheel", className)} {...props}>
      {children}
    </div>
  );
}
