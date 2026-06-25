import type { ComponentPropsWithoutRef, HTMLAttributes, ReactNode } from "react";

import { StatusBadge, type StatusBadgeProps } from "@movscript/ui/primitives";
import type { IconComponent } from "@movscript/ui/primitives";
import { AppCodeBlock, AppKeyValue, AppPanel, AppSurfaceItem } from "@movscript/ui/business/app";
import { cn } from "@movscript/ui";
import "./JobDisplayUi.css";

export interface JobStatusBadgeProps extends Omit<StatusBadgeProps, "children"> {
  icon?: ReactNode;
  children: ReactNode;
}

export function JobStatusBadge({
  icon,
  children,
  className,
  ...statusProps
}: JobStatusBadgeProps) {
  return (
    <StatusBadge {...statusProps} className={cn(icon && "jobs-status-badge--with-icon", className)}>
      {icon ?? null}
      {children}
    </StatusBadge>
  );
}

export function JobSpinIcon({ children, className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("job-spin-icon", className)} {...props}>
      {children}
    </span>
  );
}

export function JobDetailPanel({
  title,
  icon,
  action,
  children,
  className,
  bodyClassName,
  ...props
}: HTMLAttributes<HTMLElement> & {
  title: ReactNode;
  icon?: IconComponent;
  action?: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <AppPanel
      data-testid="job-detail-card"
      icon={icon}
      title={title}
      action={action}
      className={cn("job-detail-panel", className)}
      bodyClassName={cn("job-detail-panel__body", bodyClassName)}
      {...props}
    >
      {children}
    </AppPanel>
  );
}

export function JobDetailSummary({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("job-detail-summary", className)} {...props}>
      {children}
    </div>
  );
}

export function JobDetailActions({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("job-detail-actions", className)} {...props}>
      {children}
    </div>
  );
}

export function JobDetailPrompt({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("job-detail-prompt", className)} {...props}>
      {children}
    </p>
  );
}

export function JobDetailMeta({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("job-detail-meta", className)} {...props}>
      {children}
    </p>
  );
}

export function JobDetailKeyValueGrid({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("job-detail-key-value-grid", className)} {...props}>
      {children}
    </div>
  );
}

export function JobDetailKeyValue(props: ComponentPropsWithoutRef<typeof AppKeyValue>) {
  return <AppKeyValue {...props} />;
}

export function JobDetailBlock({
  title,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { title: ReactNode }) {
  return (
    <div className={cn("job-detail-block", className)} {...props}>
      <p className="job-detail-block__title">{title}</p>
      {children}
    </div>
  );
}

export function JobTraceEntry({
  title,
  status,
  message,
  meta,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  status: ReactNode;
  message?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <AppSurfaceItem variant="muted" className={cn("job-trace-entry", className)} {...props}>
      <div className="job-trace-entry__header">
        <p className="job-trace-entry__title">{title}</p>
        <span className="job-trace-entry__status">{status}</span>
      </div>
      {message ? <p className="job-trace-entry__message">{message}</p> : null}
      {meta ? <p className="job-trace-entry__meta">{meta}</p> : null}
    </AppSurfaceItem>
  );
}

export function JobCodeHistory({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <AppSurfaceItem variant="muted" className={cn("job-code-history", className)} {...props}>
      {children}
    </AppSurfaceItem>
  );
}

export function JobDetailCodeBlock(props: ComponentPropsWithoutRef<typeof AppCodeBlock>) {
  return <AppCodeBlock {...props} />;
}

export function JobCardShell({
  selected = false,
  layout = "list",
  children,
  className,
  bodyClassName,
  ...props
}: HTMLAttributes<HTMLElement> & {
  selected?: boolean;
  layout?: "list" | "grid";
  bodyClassName?: string;
}) {
  return (
    <AppPanel
      className={cn("job-card", selected && "job-card--selected", className)}
      bodyClassName={cn("job-card__body", bodyClassName)}
      data-layout={layout}
      {...props}
    >
      {children}
    </AppPanel>
  );
}

export function JobListHeader({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("job-list-header", className)} {...props}>
      {children}
    </div>
  );
}

export function JobTypeIcon({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("job-type-icon", className)} {...props}>
      {children}
    </div>
  );
}

export function JobTitleBlock({
  title,
  description,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { title: ReactNode; description?: ReactNode }) {
  return (
    <div className={cn("job-title-block", className)} {...props}>
      <p className="job-title-block__title">{title}</p>
      {description ? <p className="job-title-block__description">{description}</p> : null}
    </div>
  );
}

export function JobActionRow({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("job-action-row", className)} {...props}>
      {children}
    </div>
  );
}

export function JobTimestamp({ children, className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("job-timestamp", className)} {...props}>
      {children}
    </span>
  );
}

export function JobContextBar({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("job-context-bar", className)} {...props}>
      {children}
    </div>
  );
}

export function JobListMediaArea({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("job-list-media-area", className)} {...props}>
      {children}
    </div>
  );
}

export function JobListMediaPreview({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("job-list-media-area__preview", className)} {...props}>
      {children}
    </div>
  );
}

export function JobGridMediaArea({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("job-grid-media-area", className)} {...props}>
      {children}
    </div>
  );
}

export function JobGridMediaPreview({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("job-grid-media-area__preview", className)} {...props}>
      {children}
    </div>
  );
}

export function JobOverlayAction({
  children,
  position = "left",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { position?: "left" | "right" }) {
  return (
    <div data-position={position} className={cn("job-overlay-action", className)} {...props}>
      {children}
    </div>
  );
}

export function JobCardState({
  tone = "neutral",
  layout = "row",
  icon,
  text,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: "neutral" | "danger";
  layout?: "row" | "stack";
  icon?: ReactNode;
  text?: ReactNode;
}) {
  return (
    <div data-tone={tone} data-layout={layout} className={cn("job-card-state", className)} {...props}>
      {icon}
      <div className="job-card-state__body">{text ? <p>{text}</p> : children}</div>
    </div>
  );
}

export function JobGridCaption({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("job-grid-caption", className)} {...props}>
      {children}
    </div>
  );
}

export function JobGridTitle({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("job-grid-title", className)} {...props}>
      {children}
    </p>
  );
}

export function JobGridDescription({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("job-grid-description", className)} {...props}>
      {children}
    </p>
  );
}
