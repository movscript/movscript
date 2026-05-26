"use client";

import type { ComponentProps, HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { toneSurfaceClass, toneTextClass, type SemanticTone } from "../../../../../semantic";
import { ReviewCallout } from "../../../review";
import { AgentSurfaceBlock, type AgentSurfaceBlockProps } from "../../surface-block";

export type AgentRunTone = SemanticTone;

export function AgentRunCallout({
  className,
  ...props
}: ComponentProps<typeof ReviewCallout>) {
  return <ReviewCallout className={cn("agent-run-callout", className)} {...props} />;
}

export function AgentRunToneText({
  as: Element = "span",
  tone,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "div" | "p" | "span";
  tone: AgentRunTone;
  children?: ReactNode;
}) {
  return (
    <Element className={cn("agent-run-tone-text", toneTextClass(tone), className)} {...props}>
      {children}
    </Element>
  );
}

export function AgentRunToneSurfaceBlock({
  tone,
  className,
  ...props
}: AgentSurfaceBlockProps & {
  tone: AgentRunTone;
}) {
  return (
    <AgentSurfaceBlock
      className={cn("agent-run-tone-surface-block", toneSurfaceClass(tone), className)}
      {...props}
    />
  );
}
