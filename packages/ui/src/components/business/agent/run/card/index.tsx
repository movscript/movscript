"use client";

import * as React from "react";

import { cn } from "../../../../../lib/cn";
import { Surface } from "../../../../primitives";
import type { AgentSurfaceTone } from "../../types";
import { AgentRunToneSurfaceBlock, AgentRunToneText } from "../feedback";

export type AgentRunMetricState = "neutral" | "warning" | "danger" | "ready";

export interface AgentRunCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: AgentSurfaceTone;
  selected?: boolean;
  title?: React.ReactNode;
  eyebrow?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}

export const AgentRunCard = React.forwardRef<HTMLDivElement, AgentRunCardProps>(
  ({ className, tone = "neutral", selected = false, title, eyebrow, meta, actions, children, ...props }, ref) => {
    return (
      <Surface
        ref={ref}
        kind="card"
        tone={tone === "accent" ? "brand" : tone}
        density="normal"
        emphasis="raised"
        interaction={selected ? "selected" : "none"}
        data-selected={selected ? "true" : undefined}
        className={cn("ms-agent-frame ms-agent-run-card", `ms-agent-run-card--${tone}`, className)}
        {...props}
      >
        {(title || eyebrow || meta || actions) ? (
          <div className="ms-frame__header ms-agent-frame__header ms-agent-run-card__header">
            <div className="ms-frame__heading ms-agent-run-card__heading">
              {eyebrow ? <span className="ms-agent-run-card__eyebrow">{eyebrow}</span> : null}
              {title ? <span className="ms-agent-text ms-agent-text--truncate ms-frame__title ms-agent-run-card__title">{title}</span> : null}
              {meta ? <span className="ms-agent-text ms-agent-text--meta ms-agent-run-card__meta">{meta}</span> : null}
            </div>
            {actions ? <div className="ms-agent-cluster ms-agent-run-card__actions">{actions}</div> : null}
          </div>
        ) : null}
        {children ? <div className="ms-agent-stack ms-frame__body ms-agent-run-card__body">{children}</div> : null}
      </Surface>
    );
  }
);

AgentRunCard.displayName = "AgentRunCard";

export const AgentRunCardGrid = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-stack ms-agent-run-card__grid", className)} {...props} />;
  }
);

AgentRunCardGrid.displayName = "AgentRunCardGrid";

export interface AgentRunMetricCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ReactNode;
  state?: AgentRunMetricState;
}

function agentRunMetricTone(state: AgentRunMetricState): "neutral" | "warning" | "danger" | "success" {
  if (state === "ready") return "success";
  return state;
}

export function AgentRunMetricCard({
  title,
  value,
  icon,
  state = "neutral",
  className,
  ...props
}: AgentRunMetricCardProps) {
  const tone = agentRunMetricTone(state);
  return (
    <AgentRunToneSurfaceBlock
      tone={tone}
      variant="card"
      className={cn("agent-run-metric-card", className)}
      {...props}
    >
      <div className="agent-run-metric-card__header">
        <span>{title}</span>
        {icon ? <span className="agent-run-metric-card__icon">{icon}</span> : null}
      </div>
      <AgentRunToneText as="div" tone={tone} className="agent-run-metric-card__value">
        {value}
      </AgentRunToneText>
    </AgentRunToneSurfaceBlock>
  );
}
