import React from "react";
import type { HTMLAttributes } from "react";

import { cn } from "../../../../../lib/cn";
import type { UiSemanticIntent } from "../../../../../style-system";

export interface AppProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  value?: number;
  tone?: "brand" | UiSemanticIntent;
  size?: "xs" | "sm" | "md";
  indeterminate?: boolean;
}

export function AppProgressBar({
  value,
  tone = "brand",
  size = "sm",
  indeterminate = false,
  className,
  children,
  role = "progressbar",
  ...props
}: AppProgressBarProps) {
  const boundedValue = typeof value === "number" ? Math.min(100, Math.max(0, value)) : undefined;
  const isProgressbar = role === "progressbar";
  return (
    <div
      {...props}
      role={role}
      data-tone={tone}
      data-size={size}
      data-indeterminate={indeterminate ? "true" : undefined}
      aria-valuemin={isProgressbar && !indeterminate ? 0 : props["aria-valuemin"]}
      aria-valuemax={isProgressbar && !indeterminate ? 100 : props["aria-valuemax"]}
      aria-valuenow={isProgressbar && !indeterminate && boundedValue !== undefined ? boundedValue : props["aria-valuenow"]}
      className={cn("app-progress-bar", className)}
    >
      <div
        className="app-progress-bar__fill"
        style={!indeterminate && boundedValue !== undefined ? { width: `${boundedValue}%` } : undefined}
      />
      {children}
    </div>
  );
}
