"use client";

import * as React from "react";

import { AppMarkerDot, type AppMarkerDotProps } from "@movscript/ui/business/app";
import { Badge, Button, Frame, Input, StatusBadge, type BadgeProps, type ButtonProps, type FrameProps, type InputProps, type StatusBadgeProps } from "@movscript/ui/primitives";
import { cn } from "@/shared/ui/cn";
import {
  agentRunInteractionApprovalBadgeClass,
  agentRunInteractionApprovalImpactClass,
  agentRunInteractionApprovalInputAnswerClass,
  agentRunInteractionApprovalInputBadgeClass,
  agentRunInteractionApprovalInputChoiceClass,
  agentRunInteractionApprovalInputItemClass,
  agentRunInteractionApprovalInputRailClass,
  agentRunInteractionApprovalItemClass,
  agentRunInteractionApprovalRailClass,
  agentRunInteractionApprovalRejectActionClass,
  agentRunInteractionApprovalSectionClass,
  agentRunInteractionApprovalTitleClass,
  type AgentRunInteractionApprovalSectionState,
} from "../status";

type AgentRunInteractionSurfaceVariant = "surface" | "subtle" | "card";

interface AgentRunInteractionSurfaceProps extends Omit<FrameProps, "state"> {
  variant?: AgentRunInteractionSurfaceVariant;
}

function agentRunInteractionSurfaceEmphasis(variant: AgentRunInteractionSurfaceVariant) {
  if (variant === "card") return "raised";
  if (variant === "subtle") return "muted";
  return "plain";
}

function agentRunInteractionSurfaceClass(variant: AgentRunInteractionSurfaceVariant, className?: string) {
  return cn("ms-agent-frame ms-agent-surface-block", `ms-agent-surface-block--${variant}`, className);
}

export const AgentRunInteractionProviderSessionPanel = React.forwardRef<HTMLElement, AgentRunInteractionSurfaceProps>(
  ({ className, ...props }, ref) => {
    return (
      <Frame
        ref={ref}
        kind="panel"
        density="normal"
        emphasis="plain"
        data-variant="surface"
        className={agentRunInteractionSurfaceClass("surface", cn("agent-run-interaction-panel", className))}
        {...props}
      />
    );
  }
);

AgentRunInteractionProviderSessionPanel.displayName = "AgentRunInteractionProviderSessionPanel";

export const AgentRunInteractionProviderSessionHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("agent-run-interaction-panel__header", className)} {...props} />;
  }
);

AgentRunInteractionProviderSessionHeader.displayName = "AgentRunInteractionProviderSessionHeader";

export const AgentRunInteractionProviderSessionTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("agent-run-interaction-panel__title", className)} {...props} />;
  }
);

AgentRunInteractionProviderSessionTitle.displayName = "AgentRunInteractionProviderSessionTitle";

export function AgentRunInteractionProviderSessionStatusBadge({ className, ...props }: StatusBadgeProps) {
  return <StatusBadge className={cn("agent-run-interaction-status-badge", className)} {...props} />;
}

export const AgentRunInteractionSection = React.forwardRef<
  HTMLElement,
  AgentRunInteractionSurfaceProps & {
    state?: AgentRunInteractionApprovalSectionState;
  }
>(({ className, state, variant = "subtle", ...props }, ref) => {
  return (
    <Frame
      ref={ref}
      kind="panel"
      density="normal"
      emphasis={agentRunInteractionSurfaceEmphasis(variant)}
      data-variant={variant}
      className={agentRunInteractionSurfaceClass(variant, cn("agent-run-interaction-section", state && agentRunInteractionApprovalSectionClass(state), className))}
      {...props}
    />
  );
});

AgentRunInteractionSection.displayName = "AgentRunInteractionSection";

export const AgentRunInteractionSectionHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("agent-run-interaction-section__header", className)} {...props} />;
  }
);

AgentRunInteractionSectionHeader.displayName = "AgentRunInteractionSectionHeader";

export const AgentRunInteractionSectionTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    state?: AgentRunInteractionApprovalSectionState;
  }
>(({ className, state, ...props }, ref) => {
  return <div ref={ref} className={cn("agent-run-interaction-section__title", state && agentRunInteractionApprovalTitleClass(state), className)} {...props} />;
});

AgentRunInteractionSectionTitle.displayName = "AgentRunInteractionSectionTitle";

export const AgentRunInteractionSectionActions = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    visible?: boolean;
  }
>(({ className, visible = true, ...props }, ref) => {
  return <div ref={ref} className={cn("agent-run-interaction-section__actions", !visible && "agent-run-interaction-section__actions--hidden", className)} {...props} />;
});

AgentRunInteractionSectionActions.displayName = "AgentRunInteractionSectionActions";

export const AgentRunInteractionStack = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("agent-run-interaction-stack", className)} {...props} />;
  }
);

AgentRunInteractionStack.displayName = "AgentRunInteractionStack";

export const AgentRunInteractionApprovalCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("agent-run-interaction-card", className)} {...props} />;
  }
);

AgentRunInteractionApprovalCard.displayName = "AgentRunInteractionApprovalCard";

export const AgentRunInteractionApprovalRow = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("agent-run-interaction-card__row", className)} {...props} />;
  }
);

AgentRunInteractionApprovalRow.displayName = "AgentRunInteractionApprovalRow";

export const AgentRunInteractionApprovalBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("agent-run-interaction-card__body", className)} {...props} />;
  }
);

AgentRunInteractionApprovalBody.displayName = "AgentRunInteractionApprovalBody";

export const AgentRunInteractionApprovalHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("agent-run-interaction-card__header", className)} {...props} />;
  }
);

AgentRunInteractionApprovalHeader.displayName = "AgentRunInteractionApprovalHeader";

export const AgentRunInteractionApprovalTitle = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("agent-run-interaction-card__title", className)} {...props} />;
  }
);

AgentRunInteractionApprovalTitle.displayName = "AgentRunInteractionApprovalTitle";

export const AgentRunInteractionApprovalBadgeRow = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("agent-run-interaction-card__badges", className)} {...props} />;
  }
);

AgentRunInteractionApprovalBadgeRow.displayName = "AgentRunInteractionApprovalBadgeRow";

export const AgentRunInteractionApprovalMeta = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("agent-run-interaction-card__meta", className)} {...props} />;
  }
);

AgentRunInteractionApprovalMeta.displayName = "AgentRunInteractionApprovalMeta";

export const AgentRunInteractionApprovalPrompt = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("agent-run-interaction-card__prompt", className)} {...props} />;
  }
);

AgentRunInteractionApprovalPrompt.displayName = "AgentRunInteractionApprovalPrompt";

export const AgentRunInteractionApprovalText = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("agent-run-interaction-card__text", className)} {...props} />;
  }
);

AgentRunInteractionApprovalText.displayName = "AgentRunInteractionApprovalText";

export type AgentRunInteractionRequestKind = "approval" | "input";

export const AgentRunInteractionRequestCard = React.forwardRef<
  HTMLElement,
  AgentRunInteractionSurfaceProps & {
    status?: string;
    requestKind?: AgentRunInteractionRequestKind;
    approving?: boolean;
  }
>(({ className, status = "pending", requestKind = "approval", approving, variant = "subtle", children, ...props }, ref) => {
  const itemClass = requestKind === "input" ? agentRunInteractionApprovalInputItemClass(status) : agentRunInteractionApprovalItemClass(status);
  const railClass = requestKind === "input" ? agentRunInteractionApprovalInputRailClass(status) : agentRunInteractionApprovalRailClass(status);
  return (
    <Frame
      ref={ref}
      data-provider-session-approving={approving ? "true" : undefined}
      kind="panel"
      density="normal"
      emphasis={agentRunInteractionSurfaceEmphasis(variant)}
      data-variant={variant}
      className={agentRunInteractionSurfaceClass(variant, cn("agent-run-interaction-request-card", itemClass, className))}
      {...props}
    >
      <span className={cn("agent-run-interaction-request-card__rail", railClass)} aria-hidden="true" />
      {children}
    </Frame>
  );
});

AgentRunInteractionRequestCard.displayName = "AgentRunInteractionRequestCard";

export const AgentRunInteractionRequestHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("agent-run-interaction-request-card__header", className)} {...props} />;
  }
);

AgentRunInteractionRequestHeader.displayName = "AgentRunInteractionRequestHeader";

export const AgentRunInteractionRequestCopy = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("agent-run-interaction-request-card__copy", className)} {...props} />;
  }
);

AgentRunInteractionRequestCopy.displayName = "AgentRunInteractionRequestCopy";

export const AgentRunInteractionRequestActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("agent-run-interaction-request-card__actions", className)} {...props} />;
  }
);

AgentRunInteractionRequestActions.displayName = "AgentRunInteractionRequestActions";

export const AgentRunInteractionRequestTitle = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("agent-run-interaction-request-card__title", className)} {...props} />;
  }
);

AgentRunInteractionRequestTitle.displayName = "AgentRunInteractionRequestTitle";

export const AgentRunInteractionRequestSummary = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement> & {
    hiddenContent?: boolean;
  }
>(({ className, hiddenContent, ...props }, ref) => {
  return (
    <p
      ref={ref}
      aria-hidden={hiddenContent || undefined}
      className={cn("agent-run-interaction-request-card__summary", hiddenContent && "agent-run-interaction-request-card__summary--hidden", className)}
      {...props}
    />
  );
});

AgentRunInteractionRequestSummary.displayName = "AgentRunInteractionRequestSummary";

export const AgentRunInteractionRequestPrompt = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("agent-run-interaction-request-card__prompt", className)} {...props} />;
  }
);

AgentRunInteractionRequestPrompt.displayName = "AgentRunInteractionRequestPrompt";

export const AgentRunInteractionRequestDetail = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("agent-run-interaction-request-card__detail", className)} {...props} />;
  }
);

AgentRunInteractionRequestDetail.displayName = "AgentRunInteractionRequestDetail";

export function AgentRunInteractionMetaBadge({ className, ...props }: BadgeProps) {
  return <Badge variant="outline" className={cn("agent-run-interaction-meta-badge", className)} {...props} />;
}

export function AgentRunInteractionStateBadge({
  className,
  status,
  requestKind = "approval",
  ...props
}: BadgeProps & {
  status?: string;
  requestKind?: AgentRunInteractionRequestKind;
}) {
  const statusClass = requestKind === "input" ? agentRunInteractionApprovalInputBadgeClass(status ?? "pending") : agentRunInteractionApprovalBadgeClass(status);
  return <Badge variant="outline" className={cn("agent-run-interaction-state-badge", statusClass, className)} {...props} />;
}

export function AgentRunInteractionStatusBadge({ className, ...props }: StatusBadgeProps) {
  return <StatusBadge className={cn("agent-run-interaction-status-badge", className)} {...props} />;
}

export function AgentRunInteractionChoiceButton({
  className,
  selected,
  ...props
}: ButtonProps & {
  selected?: boolean;
}) {
  return (
    <Button
      size="xs"
      variant={selected ? "soft" : "outline"}
      className={cn("agent-run-interaction-choice-button", agentRunInteractionApprovalInputChoiceClass(Boolean(selected)), className)}
      {...props}
    />
  );
}

export function AgentRunInteractionTextInput({ className, ...props }: InputProps) {
  return <Input controlSize="sm" variant="subtle" className={cn("agent-run-interaction-text-input", className)} {...props} />;
}

export function AgentRunInteractionActionButton({
  className,
  actionTone,
  ...props
}: ButtonProps & {
  actionTone?: "default" | "reject";
}) {
  return <Button className={cn("agent-run-interaction-action-button", actionTone === "reject" && agentRunInteractionApprovalRejectActionClass(), className)} {...props} />;
}

export function AgentRunInteractionImpactText({
  className,
  status,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  status?: string;
}) {
  return <div className={cn("agent-run-interaction-impact", agentRunInteractionApprovalImpactClass(status ?? "pending"), className)} {...props} />;
}

export const AgentRunInteractionImpactLabel = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("agent-run-interaction-impact__label", className)} {...props} />;
  }
);

AgentRunInteractionImpactLabel.displayName = "AgentRunInteractionImpactLabel";

export function AgentRunInteractionAnswerText({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-run-interaction-answer", agentRunInteractionApprovalInputAnswerClass(), className)} {...props} />;
}

export function AgentRunInteractionMarkerDot({
  status,
  ...props
}: AppMarkerDotProps & {
  status?: string;
}) {
  return <AppMarkerDot {...(status ? agentRunInteractionActionDotProps(status) : undefined)} {...props} />;
}

function agentRunInteractionActionDotProps(status: string): Pick<AppMarkerDotProps, "accent" | "tone"> {
  if (status === "approved" || status === "answered" || status === "completed") return { accent: "sky" };
  if (status === "rejected" || status === "cancelled" || status === "failed") return { tone: "danger" };
  return { tone: "neutral" };
}
