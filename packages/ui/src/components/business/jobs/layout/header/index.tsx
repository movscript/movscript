import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { AppStateMessage } from "../../../app/state";

export function JobsHeader({
  title,
  meta,
  status,
  actions,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={cn("jobs-header", className)} {...props}>
      <h1 className="jobs-header__title">{title}</h1>
      {meta ? <span className="jobs-header__meta">{meta}</span> : null}
      {status ? <div className="jobs-header__status">{status}</div> : null}
      <div className="jobs-header__spacer" />
      {actions ? <div className="jobs-header__actions">{actions}</div> : null}
    </header>
  );
}

export function JobsHeaderStatus({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
}) {
  return (
    <AppStateMessage
      tone="info"
      icon={icon}
      className={cn("jobs-header-status", className)}
      {...props}
    >
      {children}
    </AppStateMessage>
  );
}
