import type { ComponentPropsWithoutRef, CSSProperties, HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { toneSurfaceClass, toneTextClass, type SemanticTone } from "../../../../semantic";
import { Badge, Button } from "../../../primitives";
import { AppInlineMeta } from "../../app";
import { WorkbenchListItem, WorkbenchSection, WorkbenchStatusBadge, WorkbenchSurfaceItem } from "../../workbench";
import type { WorkbenchIconComponent } from "../../workbench";

export type ProductionDeliveryTimelineTone = "default" | "blocked" | "ready";
type ProductionDeliveryTimelineSectionProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  description?: ReactNode;
  icon?: WorkbenchIconComponent;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function ProductionDeliveryTimelineTrack({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-delivery-timeline-track", className)} data-testid="delivery-timeline-track" {...props} />;
}

export function ProductionDeliveryTimelineSection({
  children,
  title,
  description,
  icon,
  action,
  className,
  bodyClassName,
  ...props
}: ProductionDeliveryTimelineSectionProps) {
  return (
    <WorkbenchSection
      title={title}
      description={description}
      icon={icon}
      action={action}
      className={cn("production-delivery-timeline-section", className)}
      bodyClassName={cn("production-delivery-timeline-section__body", bodyClassName)}
      {...props}
    >
      {children}
    </WorkbenchSection>
  );
}

export function ProductionDeliveryTimelineMeta({
  items,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  items: Array<{ label: ReactNode; tone?: "neutral" | "warning" }>;
}) {
  return (
    <div className={cn("production-delivery-timeline-meta", className)} {...props}>
      {items.map((item, index) => (
        <span
          key={index}
          className={cn(
            "production-delivery-timeline-meta__item",
            item.tone === "warning" && toneTextClass("warning"),
          )}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function ProductionDeliveryTimelineBadge({ className, ...props }: ComponentPropsWithoutRef<typeof Badge>) {
  return <Badge className={cn("production-delivery-timeline-badge", className)} {...props} />;
}

export function ProductionDeliveryTimelineCardRail({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-delivery-timeline-card-rail", className)} {...props} />;
}

export function ProductionDeliveryTimelineCard({
  active,
  tone = "default",
  order,
  title,
  subtitle,
  status,
  className,
  ...props
}: HTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  tone?: ProductionDeliveryTimelineTone;
  order: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  status: ReactNode;
}) {
  return (
    <WorkbenchListItem
      active={active}
      density="compact"
      className={cn(
        "production-delivery-timeline-card",
        tone === "blocked" && !active && toneSurfaceClass("warning"),
        className,
      )}
      data-testid="delivery-timeline-card"
      {...props}
    >
      <div className="production-delivery-timeline-card__header">
        <AppInlineMeta className="production-delivery-timeline-card__order">{order}</AppInlineMeta>
        <span className="production-delivery-timeline-card__title">{title}</span>
      </div>
      <span className="production-delivery-timeline-card__subtitle">{subtitle}</span>
      <span
        className={cn(
          "production-delivery-timeline-card__status",
          tone === "blocked" ? toneTextClass("warning") : toneTextClass("success"),
        )}
      >
        {status}
      </span>
    </WorkbenchListItem>
  );
}

export function ProductionDeliveryTimelineFrame({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <WorkbenchSurfaceItem className={cn("production-delivery-timeline-frame", className)} {...props} />;
}

export function ProductionDeliveryTimelineToolbar({
  icon,
  title,
  actions,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={cn("production-delivery-timeline-toolbar", className)} {...props}>
      <div className="production-delivery-timeline-toolbar__title-row">
        {icon ? <span className="production-delivery-timeline-toolbar__icon">{icon}</span> : null}
        <span className="production-delivery-timeline-toolbar__title">{title}</span>
      </div>
      {actions ? <div className="production-delivery-timeline-toolbar__actions">{actions}</div> : null}
    </div>
  );
}

export function ProductionDeliveryTimelineZoomControl({
  zoom,
  onZoomOut,
  onZoomIn,
  onReset,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  zoom: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onReset: () => void;
}) {
  return (
    <WorkbenchSurfaceItem density="compact" className={cn("production-delivery-timeline-zoom", className)} {...props}>
      <Button type="button" size="sm" variant="ghost" className="production-delivery-timeline-zoom__button" onClick={onZoomOut} aria-label="缩小时间轴">-</Button>
      <span className="production-delivery-timeline-zoom__value">{Math.round(zoom * 100)}%</span>
      <Button type="button" size="sm" variant="ghost" className="production-delivery-timeline-zoom__button" onClick={onZoomIn} aria-label="放大时间轴">+</Button>
      <Button type="button" size="sm" variant="ghost" className="production-delivery-timeline-zoom__reset" onClick={onReset} aria-label="重置时间轴缩放">1:1</Button>
    </WorkbenchSurfaceItem>
  );
}

export function ProductionDeliveryTimelineViewport({
  minWidth,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  minWidth: number;
}) {
  return (
    <div className={cn("production-delivery-timeline-viewport", className)} {...props}>
      <div className="production-delivery-timeline-viewport__canvas" style={{ minWidth }}>
        {children}
      </div>
    </div>
  );
}

export function ProductionDeliveryTimelineCanvas({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-delivery-timeline-canvas", className)} {...props} />;
}

export function ProductionDeliveryTimelineRow({
  label,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
}) {
  return (
    <div className={cn("production-delivery-timeline-row", className)} {...props}>
      <div className="production-delivery-timeline-row__label">{label}</div>
      {children}
    </div>
  );
}

export function ProductionDeliveryTimelineRuler({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <WorkbenchSurfaceItem density="compact" className={cn("production-delivery-timeline-ruler", className)} {...props} />;
}

export function ProductionDeliveryTimelinePlayhead({
  left,
  label,
  subtle = false,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  left: number;
  label?: ReactNode;
  subtle?: boolean;
}) {
  return (
    <span
      aria-hidden={label ? undefined : "true"}
      className={cn(
        "production-delivery-timeline-playhead",
        subtle && "production-delivery-timeline-playhead--subtle",
        className,
      )}
      style={{ left }}
      {...props}
    >
      {label ? <span className="production-delivery-timeline-playhead__label">{label}</span> : null}
    </span>
  );
}

export function ProductionDeliveryTimelineTick({
  left,
  label,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  left: number;
  label?: ReactNode;
}) {
  return (
    <span className={cn("production-delivery-timeline-tick", className)} style={{ left }} {...props}>
      {label ? <span className="production-delivery-timeline-tick__label">{label}</span> : null}
    </span>
  );
}

export function ProductionDeliveryTimelineLaneStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-delivery-timeline-lane-stack", className)} {...props} />;
}

export function ProductionDeliveryTimelineLane({
  laneKind,
  label,
  detail,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  laneKind: string;
  label: ReactNode;
  detail: ReactNode;
}) {
  return (
    <div className={cn("production-delivery-timeline-lane-row", className)} {...props}>
      <WorkbenchSurfaceItem density="compact" className="production-delivery-timeline-lane-row__header">
        <p className="production-delivery-timeline-lane-row__title">{label}</p>
        <p className="production-delivery-timeline-lane-row__detail">{detail}</p>
      </WorkbenchSurfaceItem>
      <WorkbenchSurfaceItem density="compact" className="production-delivery-timeline-lane-row__lane" data-testid="delivery-timeline-lane" data-lane-kind={laneKind}>
        {children}
      </WorkbenchSurfaceItem>
    </div>
  );
}

export function ProductionDeliveryTimelineBlock({
  active,
  tone = "default",
  left,
  width,
  title,
  detail,
  resizeHandle,
  className,
  ...props
}: HTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  tone?: ProductionDeliveryTimelineTone;
  left: number;
  width: number;
  title: ReactNode;
  detail: ReactNode;
  resizeHandle?: ReactNode;
}) {
  return (
    <WorkbenchListItem
      active={active}
      density="compact"
      data-testid="delivery-timeline-block"
      className={cn(
        "production-delivery-timeline-block",
        tone === "blocked" && !active && toneSurfaceClass("warning"),
        className,
      )}
      style={{ left, width }}
      {...props}
    >
      <span className="production-delivery-timeline-block__title">{title}</span>
      <span className={cn("production-delivery-timeline-block__detail", tone === "blocked" ? toneTextClass("warning") : undefined)}>
        {detail}
      </span>
      {resizeHandle}
    </WorkbenchListItem>
  );
}

export function ProductionDeliveryTimelineResizeHandle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span role="separator" aria-orientation="vertical" className={cn("production-delivery-timeline-resize-handle", className)} {...props} />;
}

export function ProductionDeliveryTimelineSchedule({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("production-delivery-timeline-schedule", className)} {...props}>
      <div className="production-delivery-timeline-schedule__grid">{children}</div>
    </div>
  );
}

export function ProductionDeliveryTimelineStatusBadge(props: ComponentPropsWithoutRef<typeof WorkbenchStatusBadge>) {
  return <WorkbenchStatusBadge {...props} />;
}

export function ProductionDeliveryTimelineScheduleMetaText({
  intent,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  intent?: SemanticTone;
}) {
  return (
    <span
      className={cn("production-delivery-timeline-schedule-meta-text", intent ? toneTextClass(intent) : undefined, className)}
      {...props}
    />
  );
}

export function ProductionDeliveryTimelineScheduleRow({
  active,
  order,
  title,
  summary,
  status,
  meta,
  className,
  ...props
}: HTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  order: ReactNode;
  title: ReactNode;
  summary: ReactNode;
  status?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <WorkbenchListItem
      active={active}
      density="compact"
      data-testid="delivery-schedule-row"
      className={cn("production-delivery-timeline-schedule-row", className)}
      {...props}
    >
      <div className="production-delivery-timeline-schedule-row__header">
        <div className="production-delivery-timeline-schedule-row__body">
          <div className="production-delivery-timeline-schedule-row__title-row">
            <AppInlineMeta className="production-delivery-timeline-schedule-row__order">{order}</AppInlineMeta>
            <span className="production-delivery-timeline-schedule-row__title">{title}</span>
          </div>
          <span className="production-delivery-timeline-schedule-row__summary">{summary}</span>
        </div>
        {status ? <div className="production-delivery-timeline-schedule-row__status">{status}</div> : null}
      </div>
      {meta ? <div className="production-delivery-timeline-schedule-row__meta">{meta}</div> : null}
    </WorkbenchListItem>
  );
}
