"use client";

import * as React from "react";

import { cn } from "../../../../../lib/cn";

export type AgentMessageSectionTone = "neutral" | "result" | "process" | "diagnostic";

export interface AgentMessageSectionProps {
  title: React.ReactNode;
  tone?: AgentMessageSectionTone;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}

export function AgentMessageSection({
  title,
  tone = "neutral",
  defaultOpen = true,
  children,
}: AgentMessageSectionProps) {
  const className = cn("ms-agent-message-section", `ms-agent-message-section--${tone}`);
  if (!defaultOpen) {
    return (
      <details className={className} data-tone={tone}>
        <summary className="ms-agent-message-section__summary">{title}</summary>
        <div className="ms-agent-message-section__body">{children}</div>
      </details>
    );
  }
  return (
    <section className={className} data-tone={tone}>
      <div className="ms-agent-message-section__title">{title}</div>
      {children}
    </section>
  );
}
