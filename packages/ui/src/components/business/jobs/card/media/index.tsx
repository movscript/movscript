import type { HTMLAttributes } from "react";

import { cn } from "../../../../../lib/cn";

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

export function JobOverlayAction({ children, position = "left", className, ...props }: HTMLAttributes<HTMLDivElement> & { position?: "left" | "right" }) {
  return (
    <div data-position={position} className={cn("job-overlay-action", className)} {...props}>
      {children}
    </div>
  );
}
