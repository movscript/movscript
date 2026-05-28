import type { ComponentPropsWithoutRef, HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { Button } from "../../../primitives";
import { AppMediaFrame, AppPanel, AppStateMessage, AppSurfaceItem, AppWaveformBars, type AppWaveformBarsProps } from "../../app";
import type { IconComponent } from "../../../primitives/types";

export type ToolTimelineClipKind = "video" | "audio" | "overlay" | "caption";

export function ToolVideoEditRoot({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-root", className)} {...props} />;
}

export function ToolVideoEditHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-header", className)} {...props} />;
}

export function ToolVideoEditHeaderActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-header__actions", className)} {...props} />;
}

export function ToolVideoEditBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-body", className)} {...props} />;
}

export function ToolVideoEditMain({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <main className={cn("tool-video-edit-main", className)} {...props} />;
}

export function ToolVideoEditSplit({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("tool-video-edit-split", className)} {...props} />;
}

export function ToolVideoEditCanvasPane({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-canvas-pane", className)} {...props} />;
}

export function ToolVideoEditPreviewGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-preview-grid", className)} {...props} />;
}

export function ToolVideoEditPreviewFrame({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-preview-frame", className)} {...props} />;
}

export function ToolVideoEditEmptyPreview({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-empty-preview", className)} {...props} />;
}

export function ToolVideoEditInspector({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <aside className={cn("tool-video-edit-inspector", className)} {...props} />;
}

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

export function ToolVideoEditControlRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-control-row", className)} {...props} />;
}

export function ToolVideoEditMarkerInputRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-marker-input-row", className)} {...props} />;
}

export function ToolVideoEditTimelineSurface({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof ToolVideoEditSurface>) {
  return <ToolVideoEditSurface className={cn("tool-video-edit-timeline", className)} {...props} />;
}

export function ToolVideoEditTimelineHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-timeline__header", className)} {...props} />;
}

export function ToolVideoEditTimelineHeaderGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-timeline__header-group", className)} {...props} />;
}

export function ToolVideoEditTimelineActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-timeline__actions", className)} {...props} />;
}

export function ToolVideoEditTimelineViewport({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-timeline__viewport", className)} {...props} />;
}

export function ToolVideoEditTimelineCanvas({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-timeline__canvas", className)} {...props} />;
}

export function ToolVideoEditTimelinePlayhead({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-timeline__playhead", className)} {...props} />;
}

export function ToolVideoEditTimelineRuler({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-timeline__ruler", className)} {...props} />;
}

export function ToolVideoEditTimelineTick({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-timeline__tick", className)} {...props} />;
}

export function ToolVideoEditTimelineMarker({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-timeline__marker", className)} {...props} />;
}

export function ToolVideoEditTimelineMarkerLabel({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("tool-video-edit-timeline__marker-label", className)} {...props} />;
}

export function ToolVideoEditTrackStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-track-stack", className)} {...props} />;
}

export function ToolVideoEditTrackRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-track-row", className)} {...props} />;
}

export function ToolVideoEditTrackControls({ className, ...props }: ComponentPropsWithoutRef<typeof ToolVideoEditSurface>) {
  return <ToolVideoEditSurface className={cn("tool-video-edit-track-controls", className)} {...props} />;
}

export function ToolVideoEditTrackLaneSurface({ className, ...props }: ComponentPropsWithoutRef<typeof ToolVideoEditSurface>) {
  return <ToolVideoEditSurface className={cn("tool-video-edit-track-lane", className)} {...props} />;
}

export function ToolVideoEditTrackCollapsedGuide({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-track-collapsed-guide", className)} {...props} />;
}

export function ToolVideoEditClipTrimHandle({
  side,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  side: "start" | "end";
}) {
  return <span className={cn("tool-video-edit-clip-trim-handle", `tool-video-edit-clip-trim-handle--${side}`, className)} {...props} />;
}

export function ToolVideoEditClipTitle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("tool-video-edit-clip-title", className)} {...props} />;
}

export function ToolVideoEditClipMeta({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("tool-video-edit-clip-meta", className)} {...props} />;
}

export function ToolVideoEditClipThumbnailStrip({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-clip-thumbnail-strip", className)} {...props} />;
}

export function ToolVideoEditClipThumbnailFrame({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-clip-thumbnail-frame", className)} {...props} />;
}

export function ToolVideoEditClipThumbnailOverlay({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-clip-thumbnail-overlay", className)} {...props} />;
}

export function ToolVideoEditClipFallbackFill({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-clip-fallback-fill", className)} {...props} />;
}

export function ToolVideoEditInspectorStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-inspector-stack", className)} {...props} />;
}

export function ToolVideoEditInspectorFieldStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-inspector-field-stack", className)} {...props} />;
}

export function ToolVideoEditInspectorFieldRow({ className, ...props }: HTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("tool-video-edit-inspector-field-row", className)} {...props} />;
}

export function ToolVideoEditInspectorReadout({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-inspector-readout", className)} {...props} />;
}

export function ToolVideoEditInspectorText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("tool-video-edit-inspector-text", className)} {...props} />;
}

export function ToolVideoEditMarkerList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-video-edit-marker-list", className)} {...props} />;
}

export function ToolVideoEditMarkerRow({ className, ...props }: ComponentPropsWithoutRef<typeof ToolVideoEditSurface>) {
  return <ToolVideoEditSurface className={cn("tool-video-edit-marker-row", className)} {...props} />;
}

export function ToolVideoEditMarkerTime({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("tool-video-edit-marker-time", className)} {...props} />;
}

export function ToolVideoEditMarkerLabel({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("tool-video-edit-marker-label", className)} {...props} />;
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
