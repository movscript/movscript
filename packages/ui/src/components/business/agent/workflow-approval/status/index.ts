import { accentBadgeClass, accentDotClass, accentSurfaceClass, accentTextClass, toneDotClass, toneSurfaceClass, toneTextClass } from "../../../../../semantic";
import { cn } from "../../../../../lib/cn";

export type AgentWorkflowApprovalSectionState = "pending" | "approved" | "rejected" | "idle";

export function agentWorkflowApprovalRejectActionClass() {
  return toneTextClass("danger");
}

export function agentWorkflowApprovalSectionClass(state: AgentWorkflowApprovalSectionState): string {
  if (state === "approved") return accentSurfaceClass("sky", "bg-transparent");
  if (state === "rejected") return toneSurfaceClass("danger", "bg-transparent");
  return "border-border/30 bg-transparent";
}

export function agentWorkflowApprovalTitleClass(state: AgentWorkflowApprovalSectionState): string {
  if (state === "approved") return accentTextClass("sky");
  if (state === "rejected") return toneTextClass("danger");
  return "text-foreground";
}

export function agentWorkflowApprovalImpactClass(status: string): string {
  if (status === "approved") return accentSurfaceClass("sky", "bg-transparent");
  if (status === "rejected") return cn(toneSurfaceClass("danger"), toneTextClass("danger"));
  return "border-border/30 bg-background/30 text-muted-foreground";
}

export function agentWorkflowApprovalItemClass(status: string): string {
  if (status === "approved") return accentSurfaceClass("sky", "bg-transparent");
  if (status === "rejected") return toneSurfaceClass("danger", "bg-transparent");
  return "border-border/40";
}

export function agentWorkflowApprovalRailClass(status: string | undefined): string {
  if (status === "approved") return accentDotClass("sky");
  if (status === "rejected") return toneDotClass("danger");
  if (status === "pending") return accentDotClass("sky");
  return toneDotClass("neutral");
}

export function agentWorkflowApprovalBadgeClass(status: string | undefined): string {
  if (status === "approved") return accentBadgeClass("sky", "bg-transparent");
  if (status === "rejected") return cn(toneSurfaceClass("danger"), toneTextClass("danger"));
  if (status === "pending") return accentBadgeClass("sky", "bg-transparent");
  return "border-border/40 bg-transparent text-muted-foreground";
}

export function agentWorkflowApprovalInputChoiceClass(selected: boolean): string | undefined {
  if (!selected) return undefined;
  return cn(accentSurfaceClass("sky"), accentTextClass("sky"), "hover:bg-muted/25");
}

export function agentWorkflowApprovalInputAnswerClass(): string {
  return cn(accentSurfaceClass("sky"), accentTextClass("sky"));
}

export function agentWorkflowApprovalInputItemClass(status: string): string {
  if (status === "answered") return accentSurfaceClass("sky", "bg-transparent");
  if (status === "cancelled") return toneSurfaceClass("neutral", "bg-transparent opacity-80");
  return "border-border/40";
}

export function agentWorkflowApprovalInputRailClass(status: string): string {
  if (status === "answered") return accentDotClass("sky");
  if (status === "cancelled") return toneDotClass("neutral");
  return accentDotClass("sky");
}

export function agentWorkflowApprovalInputBadgeClass(status: string): string {
  if (status === "answered") return accentBadgeClass("sky", "bg-transparent");
  if (status === "cancelled") return cn(toneSurfaceClass("neutral"), toneTextClass("neutral"), "bg-transparent");
  return accentBadgeClass("sky", "bg-transparent");
}
