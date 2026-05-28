"use client";

import type { ComponentProps, HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { toneSurfaceClass, toneTextClass, type SemanticTone } from "../../../../../semantic";
import { AppProgressBar, type AppProgressBarProps } from "../../../app";
import { StatusBadge, type StatusBadgeProps } from "../../../../primitives";
import { ReviewCallout, ReviewStat } from "../../../review";

export type AgentGeneratedIntent = SemanticTone;

export function AgentGeneratedCard({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-generated-card", className)} {...props} />;
}

export function AgentGeneratedCardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-generated-card__header", className)} {...props} />;
}

export function AgentGeneratedHeaderCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-generated-card__header-copy", className)} {...props} />;
}

export function AgentGeneratedIconSlot({
  intent,
  muted,
  spinning,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  intent?: AgentGeneratedIntent;
  muted?: boolean;
  spinning?: boolean;
}) {
  return (
    <span
      className={cn(
        "agent-generated-icon-slot",
        intent && toneTextClass(intent),
        muted && "agent-generated-icon-slot--muted",
        spinning && "agent-generated-icon-slot--spinning",
        className,
      )}
      {...props}
    />
  );
}

export function AgentGeneratedTitle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-generated-title", className)} {...props} />;
}

export function AgentGeneratedHeaderMeta({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-generated-header-meta", className)} {...props} />;
}

export function AgentGeneratedCountBadge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-generated-count-badge", className)} {...props} />;
}

export function AgentGeneratedStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-generated-stack", className)} {...props} />;
}

export function AgentGeneratedStatGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-generated-stat-grid", className)} {...props} />;
}

export function AgentGeneratedDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-generated-description", className)} {...props} />;
}

export function AgentGeneratedSupportText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-generated-support-text", className)} {...props} />;
}

export function AgentGeneratedItem({
  intent,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  intent?: AgentGeneratedIntent;
}) {
  return (
    <div
      className={cn("agent-generated-item", intent && toneSurfaceClass(intent), className)}
      {...props}
    />
  );
}

export function AgentGeneratedItemHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-generated-item__header", className)} {...props} />;
}

export function AgentGeneratedItemCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-generated-item__copy", className)} {...props} />;
}

export function AgentGeneratedItemTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-generated-item__title", className)} {...props} />;
}

export function AgentGeneratedItemMeta({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-generated-item__meta", className)} {...props} />;
}

export function AgentGeneratedItemDetail({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-generated-item__detail", className)} {...props} />;
}

export function AgentGeneratedItemProgressBar({ className, ...props }: AppProgressBarProps) {
  return <AgentGeneratedProgressBar className={cn("agent-generated-item__progress", className)} {...props} />;
}

export function AgentGeneratedStatPill({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <AgentGeneratedItem>
      <AgentGeneratedItemMeta>{label}</AgentGeneratedItemMeta>
      <AgentGeneratedItemTitle>{value}</AgentGeneratedItemTitle>
    </AgentGeneratedItem>
  );
}

export function AgentGeneratedCallout({
  intent,
  className,
  ...props
}: Omit<ComponentProps<typeof ReviewCallout>, "tone"> & {
  intent: AgentGeneratedIntent;
}) {
  return <ReviewCallout tone={intent} className={cn("agent-generated-callout", className)} {...props} />;
}

export function AgentGeneratedStat({
  intent,
  className,
  ...props
}: Omit<ComponentProps<typeof ReviewStat>, "tone"> & {
  intent: AgentGeneratedIntent;
}) {
  return <ReviewStat tone={intent} className={cn("agent-generated-stat", className)} {...props} />;
}

export function AgentGeneratedStatusBadge({ className, ...props }: StatusBadgeProps) {
  return <StatusBadge className={cn("agent-generated-status-badge", className)} {...props} />;
}

export function AgentGeneratedProgressBar({ className, ...props }: AppProgressBarProps) {
  return <AppProgressBar className={cn("agent-generated-progress-bar", className)} {...props} />;
}

export function AgentGeneratedIntentText({
  as: Element = "span",
  intent,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "div" | "p" | "span";
  intent: AgentGeneratedIntent;
  children?: ReactNode;
}) {
  return (
    <Element className={cn("agent-generated-intent-text", toneTextClass(intent), className)} {...props}>
      {children}
    </Element>
  );
}
