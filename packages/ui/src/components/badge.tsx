"use client";

import * as React from "react";
import { cn } from "../lib/cn";

export type BadgeVariant =
  | "default"
  | "neutral"
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "danger"
  | "destructive"
  | "outline"
  | "ghost"
  | "link";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const normalizedVariant = variant === "destructive" ? "danger" : variant;

    return (
      <span
        ref={ref}
        className={cn("ms-badge", `ms-badge--${normalizedVariant}`, className)}
        {...props}
      />
    );
  }
);

Badge.displayName = "Badge";
