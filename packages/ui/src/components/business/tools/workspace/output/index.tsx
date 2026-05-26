import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { AppMediaFrame } from "../../../app";
import { Button, type ButtonProps } from "../../../../primitives/button";
import { ToolPanel, ToolPanelHeader } from "../panel";

export function ToolOutputPanel({ title, children, className, ...props }: HTMLAttributes<HTMLDivElement> & { title: ReactNode }) {
  return (
    <ToolPanel className={className} {...props}>
      <ToolPanelHeader title={title} />
      {children}
    </ToolPanel>
  );
}

export function ToolOutputStage({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <AppMediaFrame variant="stage" className={cn("tool-output-stage", className)} {...props}>
      {children}
    </AppMediaFrame>
  );
}

export function ToolOutputState({
  tone = "neutral",
  layout = "row",
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: "neutral" | "danger";
  layout?: "row" | "stack";
  icon?: ReactNode;
}) {
  return (
    <div data-tone={tone} data-layout={layout} className={cn("tool-output-state", className)} {...props}>
      {icon}
      <div className="tool-output-state__body">{children}</div>
    </div>
  );
}

export function ToolOutputMediaShell({ children, action, className, ...props }: HTMLAttributes<HTMLDivElement> & { action?: ReactNode }) {
  return (
    <div className={cn("tool-output-media-shell", className)} {...props}>
      {children}
      {action ? <div className="tool-output-media-shell__action">{action}</div> : null}
    </div>
  );
}

export function ToolOutputDownloadAction({ children, className, ...props }: ButtonProps) {
  return (
    <Button asChild variant="soft" size="sm" className={cn("tool-output-download-action", className)} {...props}>
      {children}
    </Button>
  );
}
