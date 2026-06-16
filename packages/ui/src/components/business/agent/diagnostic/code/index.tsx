"use client";

import * as React from "react";
import { AppCodeBlock } from "../../../app";
import { cn } from "../../../../../lib/cn";

export interface AgentDiagnosticCodeBlockProps extends React.HTMLAttributes<HTMLElement> {
  size?: "sm" | "md" | "lg";
  tone?: "muted" | "default";
}

export function AgentDiagnosticCodeBlock({
  size = "md",
  tone = "muted",
  className,
  ...props
}: AgentDiagnosticCodeBlockProps) {
  return (
    <AppCodeBlock
      data-size={size}
      data-tone={tone}
      className={cn("ms-agent-diagnostic-code", size === "sm" ? "ms-type-tiny" : "ms-type-caption", className)}
      {...props}
    />
  );
}
