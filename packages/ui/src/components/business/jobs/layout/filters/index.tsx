import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { Button, type ButtonProps } from "../../../../primitives";
import { Separator } from "../../../../primitives/separator";

export function JobsFilterBar({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("jobs-filter-bar", className)} {...props}>
      {children}
    </div>
  );
}

export function JobsFilterGroup({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("jobs-filter-group", className)} {...props}>
      {children}
    </div>
  );
}

export function JobsFilterDivider() {
  return (
    <Separator
      orientation="vertical"
      className="jobs-filter-divider"
    />
  );
}

export function JobsViewToggle({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("jobs-view-toggle", className)} {...props}>
      {children}
    </div>
  );
}

export const JobsFilterChipButton = forwardRef<HTMLButtonElement, ButtonProps & {
  active?: boolean;
  icon?: ReactNode;
  count?: ReactNode;
}>(({ active = false, icon, count, children, className, variant, size = "xs", ...props }, ref) => (
  <Button
    ref={ref}
    type="button"
    variant={variant ?? (active ? "solid" : "soft")}
    size={size}
    className={cn("jobs-filter-chip-button", className)}
    data-active={active ? "true" : "false"}
    {...props}
  >
    {icon ? <span className="jobs-filter-chip-button__icon">{icon}</span> : null}
    <span className="jobs-filter-chip-button__label">{children}</span>
    {count ? <span className="jobs-filter-chip-button__count">{count}</span> : null}
  </Button>
));

JobsFilterChipButton.displayName = "JobsFilterChipButton";
