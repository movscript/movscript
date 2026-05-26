import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { Button, type ButtonProps } from "../../../../primitives";
import { AppInlineMeta } from "../../../app";
import { WorkbenchListItem, WorkbenchSurfaceItem } from "../../../workbench";

export type ContentWorkbenchUnitActionTone = "idle" | "blocked" | "ready";
export type ContentWorkbenchUnitExecutionTone = "ready" | "blocked";
export type ContentWorkbenchUnitMetaTone = "neutral" | "warning";
export type ContentWorkbenchShotListFieldTone = "neutral" | "warning";
export type ContentWorkbenchTimelineBlockTone = "default" | "blocked";

export function ContentWorkbenchUnitTrackShell({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("content-workbench-unit-track", className)} data-testid="content-workbench-unit-track" {...props} />;
}

export function ContentWorkbenchUnitTrackHeader({
  icon,
  title,
  detail,
  aside,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className={cn("content-workbench-unit-track-header", className)} {...props}>
      <div className="content-workbench-unit-track-header__body">
        <div className="content-workbench-unit-track-header__title-row">
          {icon ? <span className="content-workbench-unit-track-header__icon">{icon}</span> : null}
          <h3 className="content-workbench-unit-track-header__title">{title}</h3>
        </div>
        {detail ? <p className="content-workbench-unit-track-header__detail">{detail}</p> : null}
      </div>
      {aside ? <div className="content-workbench-unit-track-header__aside">{aside}</div> : null}
    </div>
  );
}

export function ContentWorkbenchUnitTrackMeta({
  items,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  items: Array<{
    label: ReactNode;
    tone?: ContentWorkbenchUnitMetaTone;
  }>;
}) {
  return (
    <div className={cn("content-workbench-unit-track-meta", className)} data-testid="content-workbench-unit-track-summary" {...props}>
      {items.map((item, index) => (
        <span key={index} className="content-workbench-unit-track-meta__item" data-tone={item.tone ?? "neutral"}>
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function ContentWorkbenchUnitControlBar({
  filters,
  actions,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  filters: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={cn("content-workbench-unit-control-bar", className)} {...props}>
      {filters}
      {actions ? <div className="content-workbench-unit-control-bar__actions">{actions}</div> : null}
    </div>
  );
}

export function ContentWorkbenchUnitKindFilterGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-workbench-unit-kind-filter", className)} data-testid="content-workbench-unit-kind-filter" {...props} />;
}

export function ContentWorkbenchUnitKindFilterButton({
  active = false,
  className,
  ...props
}: ButtonProps & {
  active?: boolean;
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant={active ? "soft" : "outline"}
      className={cn("content-workbench-unit-kind-filter__button", className)}
      {...props}
    />
  );
}

export function ContentWorkbenchUnitTrackActionButton({ className, size = "sm", ...props }: ButtonProps) {
  return <Button type="button" size={size} className={cn("content-workbench-unit-track-action-button", className)} {...props} />;
}

export function ContentWorkbenchUnitSceneBrief({
  title,
  detail,
  badges,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  detail: ReactNode;
  badges?: ReactNode;
}) {
  return (
    <div className={cn("content-workbench-unit-scene-brief", className)} data-testid="content-workbench-scene-shot-taskGraph-brief" {...props}>
      <div className="content-workbench-unit-scene-brief__body">
        <p className="content-workbench-unit-scene-brief__title">{title}</p>
        <p className="content-workbench-unit-scene-brief__detail">{detail}</p>
      </div>
      {badges ? <div className="content-workbench-unit-scene-brief__badges">{badges}</div> : null}
    </div>
  );
}

export function ContentWorkbenchUnitExecutionRegion({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-workbench-unit-execution-region", className)} {...props} />;
}

export function ContentWorkbenchUnitExecutionGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-workbench-unit-execution-grid", className)} data-testid="content-workbench-execution-list" {...props} />;
}

export function ContentWorkbenchUnitExecutionCard({
  active = false,
  draggable,
  identifier,
  heading,
  summary,
  status,
  details,
  actions,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  draggable?: boolean;
  identifier: ReactNode;
  heading: ReactNode;
  summary: ReactNode;
  status: ReactNode;
  details?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <WorkbenchSurfaceItem
      active={active}
      role="button"
      tabIndex={0}
      className={cn("content-workbench-unit-execution-card", className)}
      draggable={draggable}
      data-draggable={draggable ? "true" : undefined}
      data-testid="content-workbench-unit-card"
      {...props}
    >
      <div className="content-workbench-unit-execution-card__header">
        <div className="content-workbench-unit-execution-card__body">
          <div className="content-workbench-unit-execution-card__title-row">
            <AppInlineMeta className="content-workbench-unit-execution-card__identifier">{identifier}</AppInlineMeta>
            <span className="content-workbench-unit-execution-card__title">{heading}</span>
          </div>
          <span className="content-workbench-unit-execution-card__summary">{summary}</span>
        </div>
        {status}
      </div>
      {details}
      {actions}
    </WorkbenchSurfaceItem>
  );
}

export function ContentWorkbenchUnitExecutionStatus({
  tone,
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone: ContentWorkbenchUnitExecutionTone;
  icon?: ReactNode;
}) {
  return (
    <span className={cn("content-workbench-unit-execution-status", className)} data-tone={tone} {...props}>
      {icon ? <span className="content-workbench-unit-execution-status__icon">{icon}</span> : null}
      {children}
    </span>
  );
}

export function ContentWorkbenchUnitExecutionDetailGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-workbench-unit-execution-detail-grid", className)} {...props} />;
}

export function ContentWorkbenchUnitExecutionDetail({
  label,
  value,
  meta,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className={cn("content-workbench-unit-execution-detail", className)} {...props}>
      <span className="content-workbench-unit-execution-detail__label">{label}</span>
      <span className="content-workbench-unit-execution-detail__value">{value}</span>
      {meta ? <span className="content-workbench-unit-execution-detail__meta">{meta}</span> : null}
    </div>
  );
}

export function ContentWorkbenchUnitExecutionActionRow({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("content-workbench-unit-execution-action-row", className)} {...props} />;
}

export function ContentWorkbenchUnitMoveButton({ className, ...props }: ButtonProps) {
  return <Button type="button" size="icon-xs" variant="ghost" className={cn("content-workbench-unit-move-button", className)} {...props} />;
}

export function ContentWorkbenchUnitScheduleFrame({
  header,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  header?: ReactNode;
}) {
  return (
    <div className={cn("content-workbench-unit-schedule", className)} data-testid="content-workbench-unit-schedule" {...props}>
      {header ? <div className="content-workbench-unit-schedule__header">{header}</div> : null}
      {children}
    </div>
  );
}

export function ContentWorkbenchUnitScheduleHeader({
  icon,
  title,
  badge,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  title: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className={cn("content-workbench-unit-schedule-header", className)} {...props}>
      <div className="content-workbench-unit-schedule-header__title-row">
        {icon ? <span className="content-workbench-unit-schedule-header__icon">{icon}</span> : null}
        <span className="content-workbench-unit-schedule-header__title">{title}</span>
      </div>
      {badge ? <div className="content-workbench-unit-schedule-header__badge">{badge}</div> : null}
    </div>
  );
}

export function ContentWorkbenchUnitScheduleEmpty({
  title,
  detail,
  actions,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  detail: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={cn("content-workbench-unit-schedule-empty", className)} {...props}>
      <p className="content-workbench-unit-schedule-empty__title">{title}</p>
      <p className="content-workbench-unit-schedule-empty__detail">{detail}</p>
      {actions ? <div className="content-workbench-unit-schedule-empty__actions">{actions}</div> : null}
    </div>
  );
}

export function ContentWorkbenchUnitScheduleToolbar({
  switcher,
  controls,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  switcher: ReactNode;
  controls?: ReactNode;
}) {
  return (
    <div className={cn("content-workbench-unit-schedule-toolbar", className)} {...props}>
      {switcher}
      {controls ? <div className="content-workbench-unit-schedule-toolbar__controls">{controls}</div> : null}
    </div>
  );
}

export function ContentWorkbenchUnitPanelSwitcher({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <WorkbenchSurfaceItem
      className={cn("content-workbench-unit-panel-switcher", className)}
      data-testid="content-workbench-schedule-panel-switcher"
      {...props}
    >
      {children}
    </WorkbenchSurfaceItem>
  );
}

export function ContentWorkbenchUnitPanelTab({
  active = false,
  className,
  ...props
}: ButtonProps & {
  active?: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "solid" : "ghost"}
      className={cn("content-workbench-unit-panel-tab", className)}
      {...props}
    />
  );
}

export function ContentWorkbenchTimelineStatusGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-workbench-timeline-status-group", className)} {...props} />;
}

export function ContentWorkbenchTimelineZoomControl({
  value,
  onZoomOut,
  onZoomIn,
  onReset,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  value: ReactNode;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onReset: () => void;
}) {
  return (
    <WorkbenchSurfaceItem
      className={cn("content-workbench-timeline-zoom", className)}
      data-testid="content-workbench-timeline-zoom"
      {...props}
    >
      <Button type="button" size="sm" variant="ghost" className="content-workbench-timeline-zoom__button" onClick={onZoomOut} aria-label="缩小时间轴">
        -
      </Button>
      <span className="content-workbench-timeline-zoom__value">{value}</span>
      <Button type="button" size="sm" variant="ghost" className="content-workbench-timeline-zoom__button" onClick={onZoomIn} aria-label="放大时间轴">
        +
      </Button>
      <Button type="button" size="sm" variant="ghost" className="content-workbench-timeline-zoom__reset" onClick={onReset} aria-label="重置时间轴缩放">
        1:1
      </Button>
    </WorkbenchSurfaceItem>
  );
}

export function ContentWorkbenchTimelineViewport({
  minWidth,
  children,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  minWidth: number;
}) {
  return (
    <div className={cn("content-workbench-timeline-viewport", className)}>
      <div className="content-workbench-timeline-viewport__canvas" style={{ minWidth, ...style }}>
        <div className="content-workbench-timeline" data-testid="content-workbench-unit-timeline" {...props}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function ContentWorkbenchTimelineGridRow({
  label,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("content-workbench-timeline-grid-row", className)} {...props}>
      <div className="content-workbench-timeline-grid-row__label">{label}</div>
      {children}
    </div>
  );
}

export function ContentWorkbenchTimelineRuler({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <WorkbenchSurfaceItem density="compact" className={cn("content-workbench-timeline-ruler", className)} {...props}>
      {children}
    </WorkbenchSurfaceItem>
  );
}

export function ContentWorkbenchTimelinePlayhead({
  left,
  label,
  compact = false,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  left: number;
  label?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn("content-workbench-timeline-playhead", compact && "content-workbench-timeline-playhead--compact", className)}
      data-testid={compact ? undefined : "content-workbench-timeline-playhead"}
      style={{ left, ...style }}
      {...props}
    >
      {label ? <span className="content-workbench-timeline-playhead__label">{label}</span> : null}
    </div>
  );
}

export function ContentWorkbenchTimelineTick({
  left,
  label,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  left: number;
  label?: ReactNode;
}) {
  return (
    <div className={cn("content-workbench-timeline-tick", className)} style={{ left, ...style }} {...props}>
      {label ? <span className="content-workbench-timeline-tick__label">{label}</span> : null}
    </div>
  );
}

export function ContentWorkbenchTimelineBoundary({
  left,
  label,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  left: number;
  label?: ReactNode;
}) {
  return (
    <div
      className={cn("content-workbench-timeline-boundary", className)}
      data-testid="content-workbench-timeline-boundary"
      style={{ left, ...style }}
      {...props}
    >
      {label ? <span className="content-workbench-timeline-boundary__label">{label}</span> : null}
    </div>
  );
}

export function ContentWorkbenchTimelineLaneStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-workbench-timeline-lane-stack", className)} {...props} />;
}

export function ContentWorkbenchTimelineLaneHeader({
  title,
  detail,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <WorkbenchSurfaceItem density="compact" className={cn("content-workbench-timeline-lane-header", className)} {...props}>
      <p className="content-workbench-timeline-lane-header__title">{title}</p>
      {detail ? <p className="content-workbench-timeline-lane-header__detail">{detail}</p> : null}
    </WorkbenchSurfaceItem>
  );
}

export function ContentWorkbenchTimelineLane({
  laneKind,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  laneKind: string;
  children: ReactNode;
}) {
  return (
    <WorkbenchSurfaceItem
      density="compact"
      className={cn("content-workbench-timeline-lane", className)}
      data-testid="content-workbench-timeline-lane"
      data-lane-kind={laneKind}
      {...props}
    >
      {children}
    </WorkbenchSurfaceItem>
  );
}

export function ContentWorkbenchTimelineLaneMarker({
  left,
  variant = "tick",
  className,
  style,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  left: number;
  variant?: "tick" | "boundary" | "playhead";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("content-workbench-timeline-lane-marker", `content-workbench-timeline-lane-marker--${variant}`, className)}
      style={{ left, ...style } as CSSProperties}
      {...props}
    />
  );
}

export function ContentWorkbenchTimelineBlock({
  active = false,
  left,
  width,
  blockTitle,
  detail,
  tone = "default",
  muted = false,
  draggable,
  className,
  style,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  left: number;
  width: number;
  blockTitle: ReactNode;
  detail: ReactNode;
  tone?: ContentWorkbenchTimelineBlockTone;
  muted?: boolean;
}) {
  return (
    <WorkbenchListItem
      active={active}
      density="compact"
      className={cn("content-workbench-timeline-block", className)}
      data-testid="content-workbench-timeline-block"
      data-tone={tone}
      data-muted={muted ? "true" : undefined}
      data-draggable={draggable ? "true" : undefined}
      draggable={draggable}
      style={{ left, width, ...style }}
      {...props}
    >
      <span className="content-workbench-timeline-block__title">{blockTitle}</span>
      <span className="content-workbench-timeline-block__detail">{detail}</span>
    </WorkbenchListItem>
  );
}

export function ContentWorkbenchShotList({
  title,
  badge,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDetailsElement> & {
  title: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <details className={cn("content-workbench-shot-list", className)} data-testid="content-workbench-shot-list" {...props}>
      <summary className="content-workbench-shot-list__summary">
        <span>{title}</span>
        {badge}
      </summary>
      {children}
    </details>
  );
}

export function ContentWorkbenchShotListGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-workbench-shot-list-grid", className)} {...props} />;
}

export function ContentWorkbenchShotListCard({
  active = false,
  actions,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  actions?: ReactNode;
}) {
  return (
    <WorkbenchSurfaceItem
      active={active}
      density="compact"
      className={cn("content-workbench-shot-list-card", className)}
      data-testid="content-workbench-shot-list-row"
      {...props}
    >
      {children}
      {actions}
    </WorkbenchSurfaceItem>
  );
}

export function ContentWorkbenchShotListHeader({
  identifier,
  title,
  summary,
  status,
  onOpen,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  identifier: ReactNode;
  title: ReactNode;
  summary: ReactNode;
  status?: ReactNode;
  onOpen: () => void;
}) {
  return (
    <div className={cn("content-workbench-shot-list-header", className)} {...props}>
      <Button type="button" variant="ghost" size="sm" className="content-workbench-shot-list-title-button" onClick={onOpen}>
        <span className="content-workbench-shot-list-title-button__title-row">
          <AppInlineMeta className="content-workbench-shot-list-title-button__identifier">{identifier}</AppInlineMeta>
          <span className="content-workbench-shot-list-title-button__title">{title}</span>
        </span>
        <span className="content-workbench-shot-list-title-button__summary">{summary}</span>
      </Button>
      {status}
    </div>
  );
}

export function ContentWorkbenchShotListFieldGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-workbench-shot-list-field-grid", className)} {...props} />;
}

export function ContentWorkbenchShotListFieldButton({
  label,
  value,
  fieldTone = "neutral",
  wide = false,
  className,
  ...props
}: ButtonProps & {
  label: ReactNode;
  value: ReactNode;
  fieldTone?: ContentWorkbenchShotListFieldTone;
  wide?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("content-workbench-shot-list-field-button", wide && "content-workbench-shot-list-field-button--wide", className)}
      data-tone={fieldTone}
      {...props}
    >
      <span className="content-workbench-shot-list-field-button__label">{label}</span>
      <span className="content-workbench-shot-list-field-button__value">{value}</span>
    </Button>
  );
}

export function ContentWorkbenchShotListActionBar({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("content-workbench-shot-list-action-bar", className)} {...props}>
      <span className="content-workbench-shot-list-action-bar__actions">{children}</span>
    </div>
  );
}

export function ContentWorkbenchUnitInspectorShell({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <aside
      className={cn("content-workbench-unit-inspector", className)}
      data-testid="content-workbench-unit-inspector"
      data-drawer="right"
      {...props}
    />
  );
}

export function ContentWorkbenchUnitInspectorHeader({
  icon,
  kicker,
  title,
  detail,
  actions,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  kicker: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={cn("content-workbench-unit-inspector-header", className)} {...props}>
      <div className="content-workbench-unit-inspector-header__body">
        <div className="content-workbench-unit-inspector-header__kicker">
          {icon ? <span className="content-workbench-unit-inspector-header__icon">{icon}</span> : null}
          {kicker}
        </div>
        <h3 className="content-workbench-unit-inspector-header__title">{title}</h3>
        {detail ? <p className="content-workbench-unit-inspector-header__detail">{detail}</p> : null}
      </div>
      {actions ? <div className="content-workbench-unit-inspector-header__actions">{actions}</div> : null}
    </div>
  );
}

export function ContentWorkbenchUnitNextActionCard({
  tone = "idle",
  icon,
  label,
  detail,
  actionText,
  onAction,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: ContentWorkbenchUnitActionTone;
  icon?: ReactNode;
  label: ReactNode;
  detail: ReactNode;
  actionText?: ReactNode;
  onAction?: () => void;
}) {
  return (
    <WorkbenchSurfaceItem
      className={cn("content-workbench-unit-next-action", className)}
      data-tone={tone}
      data-testid="content-workbench-unit-drawer-action"
      {...props}
    >
      {icon ? <span className="content-workbench-unit-next-action__icon">{icon}</span> : null}
      <div className="content-workbench-unit-next-action__body">
        <p className="content-workbench-unit-next-action__label">下一步：{label}</p>
        <p className="content-workbench-unit-next-action__detail">{detail}</p>
      </div>
      {onAction && actionText ? (
        <Button
          type="button"
          size="sm"
          variant={tone === "ready" ? "solid" : "outline"}
          className="content-workbench-unit-next-action__button"
          onClick={onAction}
        >
          {actionText}
        </Button>
      ) : null}
    </WorkbenchSurfaceItem>
  );
}
