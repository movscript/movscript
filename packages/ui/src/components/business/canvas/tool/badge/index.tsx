import type { ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { StatusBadge } from "../../../../primitives";
import type { StatusIntent } from "../../../../primitives";
import type { CanvasToolSource } from "../types";

export function CanvasToolSourceBadge({
  source,
  className,
}: {
  source: CanvasToolSource;
  className?: string;
}) {
  return <span className={cn("canvas-tool-source-badge", className)}>{source === "ai" ? "AI" : "插件"}</span>;
}

export function CanvasToolStatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: ReactNode;
  className?: string;
}) {
  return (
    <StatusBadge intent={canvasToolStatusIntent(status)} className={className}>
      {label ?? status}
    </StatusBadge>
  );
}

export function canvasToolStatusIntent(label: string): StatusIntent {
  const key = canvasToolStatusKey(label);
  if (key === "done" || key === "ready") return "success";
  if (key === "running" || key === "pending") return "info";
  if (key === "failed") return "danger";
  return "neutral";
}

export function canvasToolStatusKey(label: string) {
  if (label.includes("完成")) return "done";
  if (label.includes("就绪") || label.includes("可运行")) return "ready";
  if (label.includes("运行")) return "running";
  if (label.includes("等待")) return "pending";
  if (label.includes("失败")) return "failed";
  return "idle";
}
