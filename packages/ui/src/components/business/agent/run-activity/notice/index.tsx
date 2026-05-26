"use client";

import * as React from "react";
import { cn } from "../../../../../lib/cn";
import { ReviewCallout } from "../../../review";

export interface AgentRunActivityNoticeProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: "warning" | "danger";
}

export function AgentRunActivityNotice({
  className,
  tone = "warning",
  ...props
}: AgentRunActivityNoticeProps) {
  return <ReviewCallout tone={tone} compact className={cn("ms-agent-run-activity-notice", className)} {...props} />;
}
