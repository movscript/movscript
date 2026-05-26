import type { ComponentPropsWithoutRef, HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { AppCodeBlock, AppKeyValue, AppPanel, AppSurfaceItem } from "../../app";
import type { IconComponent } from "../../../primitives/types";

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

export function JobDetailBlock({ title, children, className, ...props }: HTMLAttributes<HTMLDivElement> & { title: ReactNode }) {
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
