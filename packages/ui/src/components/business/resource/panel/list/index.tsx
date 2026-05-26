import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

import { cn } from "../../../../../lib/cn";
import { AppMediaFrame, AppSurfaceItem } from "../../../app";

export function ResourcePanelList({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("resource-panel-list", className)} {...props}>
      {children}
    </div>
  );
}

export const ResourceListItemShell = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & {
  selected?: boolean;
  draggableActive?: boolean;
}>(({ selected = false, draggableActive = false, className, children, ...props }, ref) => (
  <AppSurfaceItem
    asChild
    data-selected={selected ? "true" : undefined}
    data-draggable={draggableActive ? "true" : undefined}
    className={cn("resource-panel-list-item", className)}
  >
    <div ref={ref} {...props}>
      {children}
    </div>
  </AppSurfaceItem>
));

ResourceListItemShell.displayName = "ResourceListItemShell";

export function ResourcePanelThumb({
  children,
  size = "sm",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  size?: "sm" | "md";
}) {
  return (
    <AppMediaFrame variant="thumb" data-size={size} className={cn("resource-panel-thumb", className)} {...props}>
      {children}
    </AppMediaFrame>
  );
}

export function ResourcePanelThumbFallback({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("resource-panel-thumb__fallback", className)} {...props}>
      {children}
    </div>
  );
}

export function ResourcePanelItemName({ children, className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("resource-panel-list-item__name", className)} {...props}>
      {children}
    </span>
  );
}

export function ResourcePanelSelectedLabel({ children, className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("resource-panel-list-item__selected", className)} {...props}>
      {children}
    </span>
  );
}
