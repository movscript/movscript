import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { AppMediaFrame } from "../../app";

export type CanvasMediaFit = "cover" | "contain";

export function CanvasMediaFill({
  children,
  fit = "cover",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  fit?: CanvasMediaFit;
}) {
  return (
    <div data-fit={fit} className={cn("ms-fill canvas-media-fill", className)} {...props}>
      {children}
    </div>
  );
}

export function CanvasMediaNodeFrame({
  children,
  surface = "default",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  surface?: "default" | "dark";
}) {
  return (
    <AppMediaFrame
      variant="stage"
      data-surface={surface}
      className={cn("canvas-media-node-frame", className)}
      {...props}
    >
      {children}
    </AppMediaFrame>
  );
}

export function CanvasMediaEmptyIcon({
  surface = "default",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  surface?: "default" | "dark";
  children: ReactNode;
}) {
  return (
    <span data-surface={surface} className={cn("canvas-media-empty-icon", className)} {...props}>
      {children}
    </span>
  );
}

export function CanvasResourceShelfThumbFrame({
  children,
  compact = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <AppMediaFrame
      variant="thumb"
      data-compact={compact ? "true" : "false"}
      className={cn("canvas-resource-shelf-thumb-frame", className)}
      {...props}
    >
      {children}
    </AppMediaFrame>
  );
}
