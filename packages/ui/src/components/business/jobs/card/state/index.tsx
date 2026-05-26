import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";

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
