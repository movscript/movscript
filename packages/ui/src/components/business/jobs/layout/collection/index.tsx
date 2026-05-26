import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";

export function JobsSelectedDetailRegion({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("jobs-selected-detail", className)} {...props}>
      {children}
    </div>
  );
}

export function JobsCollection({ children, layout = "stack", className, ...props }: HTMLAttributes<HTMLDivElement> & { layout?: "stack" | "grid" }) {
  return (
    <div data-layout={layout} className={cn("jobs-collection", className)} {...props}>
      {children}
    </div>
  );
}

export function JobsCategorySection({
  control,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  control: ReactNode;
}) {
  return (
    <section className={cn("jobs-category-section", className)} {...props}>
      <div className="jobs-category-section__control">{control}</div>
      {children}
    </section>
  );
}

export function JobsCountPill({ children, className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("jobs-count-pill", className)} {...props}>
      {children}
    </span>
  );
}
