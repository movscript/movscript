import type { HTMLAttributes } from "react";

import { cn } from "../../../../../lib/cn";

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
