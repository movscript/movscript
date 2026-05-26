"use client";

import * as React from "react";

import { cn } from "../../../../../lib/cn";
import { AppMarkerDot, type AppMarkerDotProps } from "../../../app";
import { Badge, Button, Input, StatusBadge, type BadgeProps, type ButtonProps, type InputProps, type StatusBadgeProps } from "../../../../primitives";
import { AgentSurfaceBlock, type AgentSurfaceBlockProps } from "../../surface-block";
import {
  agentWorkflowApprovalBadgeClass,
  agentWorkflowApprovalImpactClass,
  agentWorkflowApprovalInputAnswerClass,
  agentWorkflowApprovalInputBadgeClass,
  agentWorkflowApprovalInputChoiceClass,
  agentWorkflowApprovalInputItemClass,
  agentWorkflowApprovalInputRailClass,
  agentWorkflowApprovalItemClass,
  agentWorkflowApprovalRailClass,
  agentWorkflowApprovalRejectActionClass,
  agentWorkflowApprovalSectionClass,
  agentWorkflowApprovalTitleClass,
  type AgentWorkflowApprovalSectionState,
} from "../status";

export const AgentWorkflowRuntimePanel = React.forwardRef<HTMLDivElement, AgentSurfaceBlockProps>(
  ({ className, ...props }, ref) => {
    return <AgentSurfaceBlock ref={ref} className={cn("ms-agent-workflow-panel", className)} {...props} />;
  }
);

AgentWorkflowRuntimePanel.displayName = "AgentWorkflowRuntimePanel";

export const AgentWorkflowRuntimeHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-workflow-panel__header", className)} {...props} />;
  }
);

AgentWorkflowRuntimeHeader.displayName = "AgentWorkflowRuntimeHeader";

export const AgentWorkflowRuntimeTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-workflow-panel__title", className)} {...props} />;
  }
);

AgentWorkflowRuntimeTitle.displayName = "AgentWorkflowRuntimeTitle";

export function AgentWorkflowRuntimeStatusBadge({ className, ...props }: StatusBadgeProps) {
  return <StatusBadge className={cn("ms-agent-workflow-status-badge", className)} {...props} />;
}

export const AgentWorkflowSection = React.forwardRef<
  HTMLDivElement,
  AgentSurfaceBlockProps & {
    state?: AgentWorkflowApprovalSectionState;
  }
>(({ className, state, variant = "subtle", ...props }, ref) => {
  return (
    <AgentSurfaceBlock
      ref={ref}
      variant={variant}
      className={cn("ms-agent-workflow-section", state && agentWorkflowApprovalSectionClass(state), className)}
      {...props}
    />
  );
});

AgentWorkflowSection.displayName = "AgentWorkflowSection";

export const AgentWorkflowSectionHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-workflow-section__header", className)} {...props} />;
  }
);

AgentWorkflowSectionHeader.displayName = "AgentWorkflowSectionHeader";

export const AgentWorkflowSectionTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    state?: AgentWorkflowApprovalSectionState;
  }
>(({ className, state, ...props }, ref) => {
  return <div ref={ref} className={cn("ms-agent-workflow-section__title", state && agentWorkflowApprovalTitleClass(state), className)} {...props} />;
});

AgentWorkflowSectionTitle.displayName = "AgentWorkflowSectionTitle";

export const AgentWorkflowSectionActions = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    visible?: boolean;
  }
>(({ className, visible = true, ...props }, ref) => {
  return <div ref={ref} className={cn("ms-agent-workflow-section__actions", !visible && "ms-agent-workflow-section__actions--hidden", className)} {...props} />;
});

AgentWorkflowSectionActions.displayName = "AgentWorkflowSectionActions";

export const AgentWorkflowStack = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-workflow-stack", className)} {...props} />;
  }
);

AgentWorkflowStack.displayName = "AgentWorkflowStack";

export const AgentWorkflowApprovalCard = React.forwardRef<HTMLDivElement, AgentSurfaceBlockProps>(
  ({ className, variant = "subtle", ...props }, ref) => {
    return <AgentSurfaceBlock ref={ref} variant={variant} className={cn("ms-agent-workflow-approval-card", className)} {...props} />;
  }
);

AgentWorkflowApprovalCard.displayName = "AgentWorkflowApprovalCard";

export const AgentWorkflowApprovalRow = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-workflow-approval-card__row", className)} {...props} />;
  }
);

AgentWorkflowApprovalRow.displayName = "AgentWorkflowApprovalRow";

export const AgentWorkflowApprovalBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-workflow-approval-card__body", className)} {...props} />;
  }
);

AgentWorkflowApprovalBody.displayName = "AgentWorkflowApprovalBody";

export const AgentWorkflowApprovalHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-workflow-approval-card__header", className)} {...props} />;
  }
);

AgentWorkflowApprovalHeader.displayName = "AgentWorkflowApprovalHeader";

export const AgentWorkflowApprovalTitle = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-workflow-approval-card__title", className)} {...props} />;
  }
);

AgentWorkflowApprovalTitle.displayName = "AgentWorkflowApprovalTitle";

export const AgentWorkflowApprovalBadgeRow = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-workflow-approval-card__badges", className)} {...props} />;
  }
);

AgentWorkflowApprovalBadgeRow.displayName = "AgentWorkflowApprovalBadgeRow";

export const AgentWorkflowApprovalMeta = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-workflow-approval-card__meta", className)} {...props} />;
  }
);

AgentWorkflowApprovalMeta.displayName = "AgentWorkflowApprovalMeta";

export const AgentWorkflowApprovalPrompt = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-agent-workflow-approval-card__prompt", className)} {...props} />;
  }
);

AgentWorkflowApprovalPrompt.displayName = "AgentWorkflowApprovalPrompt";

export const AgentWorkflowApprovalText = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-agent-workflow-approval-card__text", className)} {...props} />;
  }
);

AgentWorkflowApprovalText.displayName = "AgentWorkflowApprovalText";

export type AgentWorkflowRequestKind = "approval" | "input";

export const AgentWorkflowRequestCard = React.forwardRef<
  HTMLDivElement,
  AgentSurfaceBlockProps & {
    status?: string;
    requestKind?: AgentWorkflowRequestKind;
    approving?: boolean;
  }
>(({ className, status = "pending", requestKind = "approval", approving, variant = "subtle", children, ...props }, ref) => {
  const itemClass = requestKind === "input" ? agentWorkflowApprovalInputItemClass(status) : agentWorkflowApprovalItemClass(status);
  const railClass = requestKind === "input" ? agentWorkflowApprovalInputRailClass(status) : agentWorkflowApprovalRailClass(status);
  return (
    <AgentSurfaceBlock
      ref={ref}
      data-runtime-approving={approving ? "true" : undefined}
      variant={variant}
      className={cn("ms-agent-workflow-request-card", itemClass, className)}
      {...props}
    >
      <span className={cn("ms-agent-workflow-request-card__rail", railClass)} aria-hidden="true" />
      {children}
    </AgentSurfaceBlock>
  );
});

AgentWorkflowRequestCard.displayName = "AgentWorkflowRequestCard";

export const AgentWorkflowRequestHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-workflow-request-card__header", className)} {...props} />;
  }
);

AgentWorkflowRequestHeader.displayName = "AgentWorkflowRequestHeader";

export const AgentWorkflowRequestCopy = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-workflow-request-card__copy", className)} {...props} />;
  }
);

AgentWorkflowRequestCopy.displayName = "AgentWorkflowRequestCopy";

export const AgentWorkflowRequestActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-workflow-request-card__actions", className)} {...props} />;
  }
);

AgentWorkflowRequestActions.displayName = "AgentWorkflowRequestActions";

export const AgentWorkflowRequestTitle = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-workflow-request-card__title", className)} {...props} />;
  }
);

AgentWorkflowRequestTitle.displayName = "AgentWorkflowRequestTitle";

export const AgentWorkflowRequestSummary = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement> & {
    hiddenContent?: boolean;
  }
>(({ className, hiddenContent, ...props }, ref) => {
  return (
    <p
      ref={ref}
      aria-hidden={hiddenContent || undefined}
      className={cn("ms-agent-workflow-request-card__summary", hiddenContent && "ms-agent-workflow-request-card__summary--hidden", className)}
      {...props}
    />
  );
});

AgentWorkflowRequestSummary.displayName = "AgentWorkflowRequestSummary";

export const AgentWorkflowRequestPrompt = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-agent-workflow-request-card__prompt", className)} {...props} />;
  }
);

AgentWorkflowRequestPrompt.displayName = "AgentWorkflowRequestPrompt";

export const AgentWorkflowRequestDetail = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-agent-workflow-request-card__detail", className)} {...props} />;
  }
);

AgentWorkflowRequestDetail.displayName = "AgentWorkflowRequestDetail";

export function AgentWorkflowMetaBadge({ className, ...props }: BadgeProps) {
  return <Badge variant="outline" className={cn("ms-agent-workflow-meta-badge", className)} {...props} />;
}

export function AgentWorkflowStateBadge({
  className,
  status,
  requestKind = "approval",
  ...props
}: BadgeProps & {
  status?: string;
  requestKind?: AgentWorkflowRequestKind;
}) {
  const statusClass = requestKind === "input" ? agentWorkflowApprovalInputBadgeClass(status ?? "pending") : agentWorkflowApprovalBadgeClass(status);
  return <Badge variant="outline" className={cn("ms-agent-workflow-state-badge", statusClass, className)} {...props} />;
}

export function AgentWorkflowStatusBadge({ className, ...props }: StatusBadgeProps) {
  return <StatusBadge className={cn("ms-agent-workflow-status-badge", className)} {...props} />;
}

export function AgentWorkflowChoiceButton({
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
      className={cn("ms-agent-workflow-choice-button", agentWorkflowApprovalInputChoiceClass(Boolean(selected)), className)}
      {...props}
    />
  );
}

export function AgentWorkflowTextInput({ className, ...props }: InputProps) {
  return <Input controlSize="sm" variant="subtle" className={cn("ms-agent-workflow-text-input", className)} {...props} />;
}

export function AgentWorkflowActionButton({
  className,
  actionTone,
  ...props
}: ButtonProps & {
  actionTone?: "default" | "reject";
}) {
  return <Button className={cn("ms-agent-workflow-action-button", actionTone === "reject" && agentWorkflowApprovalRejectActionClass(), className)} {...props} />;
}

export function AgentWorkflowImpactText({
  className,
  status,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  status?: string;
}) {
  return <div className={cn("ms-agent-workflow-impact", agentWorkflowApprovalImpactClass(status ?? "pending"), className)} {...props} />;
}

export const AgentWorkflowImpactLabel = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-workflow-impact__label", className)} {...props} />;
  }
);

AgentWorkflowImpactLabel.displayName = "AgentWorkflowImpactLabel";

export function AgentWorkflowAnswerText({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("ms-agent-workflow-answer", agentWorkflowApprovalInputAnswerClass(), className)} {...props} />;
}

export function AgentWorkflowMarkerDot({
  status,
  ...props
}: AppMarkerDotProps & {
  status?: string;
}) {
  return <AppMarkerDot {...(status ? agentWorkflowActionDotProps(status) : undefined)} {...props} />;
}

function agentWorkflowActionDotProps(status: string): Pick<AppMarkerDotProps, "accent" | "tone"> {
  if (status === "approved" || status === "answered" || status === "completed") return { accent: "sky" };
  if (status === "rejected" || status === "cancelled" || status === "failed") return { tone: "danger" };
  return { tone: "neutral" };
}
