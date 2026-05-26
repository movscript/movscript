import type { ComponentPropsWithoutRef, HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { Button } from "../../../primitives";
import { AppMediaFrame, AppPanel, AppStateMessage, AppSurfaceItem, AppWaveformBars, type AppWaveformBarsProps } from "../../app";
import type { IconComponent } from "../../../primitives/types";

export type ToolTimelineClipKind = "video" | "audio" | "overlay" | "caption";

export function ToolVideoEditStage({
  className,
  variant = "stage-dark",
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: "stage" | "stage-dark" | "panel" | "thumb" | "fill" | "placeholder" }) {
  return <AppMediaFrame variant={variant} className={cn("tool-video-edit-stage", className)} {...props} />;
}

export function ToolVideoEditPanel({
  className,
  bodyClassName,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  icon?: IconComponent;
  iconClassName?: string;
  action?: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <AppPanel
      className={cn("tool-video-edit-panel", className)}
      bodyClassName={cn("tool-video-edit-panel__body", bodyClassName)}
      {...props}
    />
  );
}

export function ToolVideoEditSurface({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  asChild?: boolean;
  density?: "normal" | "compact";
  variant?: "card" | "overlay" | "muted";
}) {
  return <AppSurfaceItem className={cn("tool-video-edit-surface", className)} {...props} />;
}

export function ToolVideoEditWaveform({ className, ...props }: AppWaveformBarsProps) {
  return <AppWaveformBars className={cn("tool-video-edit-waveform", className)} {...props} />;
}

export function ToolVideoEditStateMessage({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof AppStateMessage>) {
  return <AppStateMessage className={cn("tool-video-edit-state-message", className)} {...props} />;
}

export function ToolVideoEditTrackControlButton({
  state = "default",
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Button> & {
  state?: "default" | "active" | "danger";
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      data-state={state === "default" ? undefined : state}
      className={cn("tool-video-edit-track-control-button", className)}
      {...props}
    />
  );
}

export function ToolTimelineClipButton({
  kind = "video",
  collapsed = false,
  locked = false,
  selected = false,
  dragging = false,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Button> & {
  kind?: ToolTimelineClipKind;
  collapsed?: boolean;
  locked?: boolean;
  selected?: boolean;
  dragging?: boolean;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      data-kind={kind}
      data-collapsed={collapsed ? "true" : undefined}
      data-locked={locked ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      data-dragging={dragging ? "true" : undefined}
      className={cn("tool-timeline-clip", className)}
      {...props}
    />
  );
}
