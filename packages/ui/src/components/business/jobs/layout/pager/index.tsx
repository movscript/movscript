import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { Button, type ButtonProps } from "../../../../primitives";

export function JobsPager({ status, actions, className, ...props }: HTMLAttributes<HTMLDivElement> & { status: ReactNode; actions: ReactNode }) {
  return (
    <footer className={cn("jobs-pager", className)} {...props}>
      <span className="jobs-pager__status">{status}</span>
      <div className="jobs-pager__actions">{actions}</div>
    </footer>
  );
}

export const JobsPagerButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "outline", size = "sm", ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant={variant}
      size={size}
      className={cn("jobs-pager-button", className)}
      {...props}
    />
  ),
);

JobsPagerButton.displayName = "JobsPagerButton";
