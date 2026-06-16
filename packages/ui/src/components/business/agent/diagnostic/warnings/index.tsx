"use client";

import * as React from "react";
import { cn } from "../../../../../lib/cn";
import { ReviewCallout } from "../../../review";

export function AgentDiagnosticWarnings({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <ReviewCallout tone="warning" compact className={cn("ms-type-caption ms-agent-diagnostic-warnings", className)} {...props} />;
}
