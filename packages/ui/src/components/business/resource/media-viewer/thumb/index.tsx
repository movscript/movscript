import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { AppMediaFrame } from "../../../app";
import type { ResourceMediaFit } from "../types";

export function ResourceMediaThumb({
  children,
  overlay,
  interactive = true,
  fit = "cover",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  overlay?: ReactNode;
  interactive?: boolean;
  fit?: ResourceMediaFit;
}) {
  return (
    <AppMediaFrame
      data-interactive={interactive ? "true" : "false"}
      data-fit={fit}
      className={cn("resource-media-thumb", className)}
      {...props}
    >
      {children}
      {overlay}
    </AppMediaFrame>
  );
}

export function ResourceMediaHoverOverlay({ icon, className, ...props }: HTMLAttributes<HTMLDivElement> & { icon: ReactNode }) {
  return (
    <div className={cn("ms-center resource-media-hover-overlay", className)} {...props}>
      <span className="ms-inline-center resource-media-hover-overlay__icon">{icon}</span>
    </div>
  );
}

export function ResourceMediaFillFrame({
  children,
  fit = "cover",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  fit?: ResourceMediaFit;
}) {
  return (
    <AppMediaFrame variant="fill" data-fit={fit} className={cn("ms-fill ms-center resource-media-fill-frame", className)} {...props}>
      {children}
    </AppMediaFrame>
  );
}
