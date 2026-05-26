"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import type { UiSemanticEmphasis, UiSemanticIntent } from "../../style-system";

export type BadgeVariant =
  | "soft"
  | "solid"
  | "outline"
  | "ghost"
  | "link";
export type BadgeTone = "neutral" | "brand" | "info" | "success" | "warning" | "danger";
export type StatusTone = Exclude<BadgeTone, "brand">;
export type StatusIntent = UiSemanticIntent;
export type StatusEmphasis = Extract<UiSemanticEmphasis, "plain" | "soft" | "solid">;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  tone?: BadgeTone;
}

export interface StatusBadgeProps extends Omit<BadgeProps, "variant" | "tone"> {
  intent?: StatusIntent;
  emphasis?: StatusEmphasis;
  tone?: StatusTone;
}

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  intent?: StatusIntent;
  tone?: StatusTone;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "soft", tone, ...props }, ref) => {
    const visualTone = tone ?? (variant === "link" ? "brand" : "neutral");

    return (
      <span
        ref={ref}
        data-ms-component="Badge"
        data-ms-slot="root"
        data-ms-variant={variant}
        data-ms-tone={visualTone}
        className={cn("ms-badge", `ms-badge--${variant}`, `ms-badge--tone-${visualTone}`, className)}
        {...props}
      />
    );
  }
);

Badge.displayName = "Badge";

export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ children, intent, emphasis = "soft", tone, ...props }, ref) => {
    const visualTone = tone ?? intent ?? "neutral";
    const visualVariant = emphasis === "solid" ? "solid" : emphasis === "plain" ? "ghost" : visualTone === "neutral" ? "outline" : "soft";

    return (
      <Badge ref={ref} variant={visualVariant} tone={visualTone} data-ms-intent={intent ?? visualTone} data-ms-emphasis={emphasis} {...props}>
        {children}
      </Badge>
    );
  }
);

StatusBadge.displayName = "StatusBadge";

export const StatusDot = React.forwardRef<HTMLSpanElement, StatusDotProps>(
  ({ className, intent, tone, ...props }, ref) => {
    const visualTone = tone ?? intent ?? "neutral";

    return (
      <span
        ref={ref}
        data-ms-component="StatusDot"
        data-ms-slot="root"
        data-ms-intent={intent ?? visualTone}
        data-ms-tone={visualTone}
        className={cn("ms-status-dot", `ms-status-dot--tone-${visualTone}`, className)}
        {...props}
      />
    );
  }
);

StatusDot.displayName = "StatusDot";
