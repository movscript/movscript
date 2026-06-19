"use client";

import * as React from "react";
import { cn } from "../../../../../lib/cn";
import { AgentSurfaceBlock } from "../../surface-block";

export interface AgentDiagnosticDisclosureProps extends Omit<React.DetailsHTMLAttributes<HTMLDetailsElement>, "title"> {
  title: React.ReactNode;
  icon?: React.ReactNode;
  count?: React.ReactNode;
  contentScroll?: "none" | "sm" | "md" | "lg";
}

export function AgentDiagnosticDisclosure({
  title,
  icon,
  count,
  contentScroll = "none",
  children,
  className,
  ...props
}: AgentDiagnosticDisclosureProps) {
  return (
    <AgentSurfaceBlock as="details" className={cn("ms-agent-diagnostic-disclosure", className)} {...props}>
      <summary className="ms-action-row ms-type-caption ms-agent-diagnostic-disclosure__summary">
        <span className="ms-action-row ms-agent-diagnostic-disclosure__title">
          {icon ? <span className="ms-inline-center ms-agent-diagnostic-disclosure__icon">{icon}</span> : null}
          <span>{title}</span>
        </span>
        {count !== undefined ? <span className="ms-type-tiny ms-agent-diagnostic-disclosure__count">{count}</span> : null}
      </summary>
      <div data-scroll={contentScroll} className="ms-agent-diagnostic-disclosure__content">{children}</div>
    </AgentSurfaceBlock>
  );
}
