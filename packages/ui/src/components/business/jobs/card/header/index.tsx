import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";

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

export function JobTitleBlock({ title, description, className, ...props }: HTMLAttributes<HTMLDivElement> & { title: ReactNode; description?: ReactNode }) {
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
