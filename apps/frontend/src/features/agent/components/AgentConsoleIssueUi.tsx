import { type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { AgentSurfaceBlockProps } from "@movscript/ui/business/agent";
import { AgentSurfaceBlock } from "@movscript/ui/business/agent";
import { toneSurfaceClass, toneTextClass, type SemanticTone } from "@movscript/ui/semantic";

import { cn } from "@/shared/ui/cn";

export type AgentConsoleIssueTone = "action" | "warning" | "ready";

export function AgentConsoleMetricCard({
  title,
  value,
  detail,
  tone,
}: {
  title: ReactNode;
  value: ReactNode;
  detail: ReactNode;
  tone: AgentConsoleIssueTone;
}) {
  const Icon = tone === "ready" ? CheckCircle2 : tone === "action" ? XCircle : AlertTriangle;
  const semanticTone = agentConsoleIssueTextTone(tone);
  const surfaceTone = agentConsoleIssueSurfaceTone(tone);
  return (
    <AgentSurfaceBlock variant="card" className={cn("agent-console-tone-surface", surfaceTone ? toneSurfaceClass(surfaceTone) : undefined, "agent-console-metric-card")}>
      <div className="agent-console-metric-card__header">
        <p className="agent-console-metric-card__title">{title}</p>
        <Icon size={14} className={cn("agent-console-metric-card__icon", toneTextClass(semanticTone))} />
      </div>
      <p className="agent-console-metric-card__value" title={typeof value === "string" ? value : undefined}>{value}</p>
      <p className="agent-console-metric-card__detail" title={typeof detail === "string" ? detail : undefined}>{detail}</p>
    </AgentSurfaceBlock>
  );
}

export function AgentConsoleIssueSurfaceBlock({
  tone,
  className,
  ...props
}: Omit<AgentSurfaceBlockProps, "tone"> & {
  tone: Exclude<AgentConsoleIssueTone, "ready">;
}) {
  return (
    <AgentSurfaceBlock
      variant="subtle"
      className={cn("agent-console-tone-surface", toneSurfaceClass(agentConsoleIssueSurfaceTone(tone) ?? "warning"), "agent-console-issue-surface", className)}
      {...props}
    />
  );
}

export function AgentConsoleIssueRowSurface({
  tone,
  title,
  detail,
  badge,
}: {
  tone: Exclude<AgentConsoleIssueTone, "ready">;
  title: ReactNode;
  detail: ReactNode;
  badge: ReactNode;
}) {
  return (
    <AgentConsoleIssueSurfaceBlock tone={tone} className="agent-console-issue-row">
      <div className="agent-console-issue-row__header">
        <p className="agent-console-issue-row__title">{title}</p>
        {badge}
      </div>
      <p className="agent-console-issue-row__detail">{detail}</p>
    </AgentConsoleIssueSurfaceBlock>
  );
}

function agentConsoleIssueTextTone(tone: AgentConsoleIssueTone): SemanticTone {
  if (tone === "ready") return "success";
  if (tone === "action") return "danger";
  return "warning";
}

function agentConsoleIssueSurfaceTone(tone: AgentConsoleIssueTone): SemanticTone | undefined {
  if (tone === "action") return "danger";
  if (tone === "warning") return "warning";
  return undefined;
}
