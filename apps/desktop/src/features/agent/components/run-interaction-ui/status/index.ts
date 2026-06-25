import { accentBadgeClass, accentDotClass, accentSurfaceClass, accentTextClass, toneDotClass, toneSurfaceClass, toneTextClass } from "@movscript/ui/semantic";
import { cn } from "@/shared/ui/cn";

export type AgentRunInteractionApprovalSectionState = "pending" | "approved" | "rejected" | "idle";

export function agentRunInteractionApprovalRejectActionClass() {
  return toneTextClass("danger");
}

export function agentRunInteractionApprovalSectionClass(state: AgentRunInteractionApprovalSectionState): string {
  if (state === "approved") return accentSurfaceClass("sky", "bg-transparent");
  if (state === "rejected") return toneSurfaceClass("danger", "bg-transparent");
  return "border-border/30 bg-transparent";
}

export function agentRunInteractionApprovalTitleClass(state: AgentRunInteractionApprovalSectionState): string {
  if (state === "approved") return accentTextClass("sky");
  if (state === "rejected") return toneTextClass("danger");
  return "text-foreground";
}

export function agentRunInteractionApprovalImpactClass(status: string): string {
  if (status === "approved") return accentSurfaceClass("sky", "bg-transparent");
  if (status === "rejected") return cn(toneSurfaceClass("danger"), toneTextClass("danger"));
  return "border-border/30 bg-background/30 text-muted-foreground";
}

export function agentRunInteractionApprovalItemClass(status: string): string {
  if (status === "approved") return accentSurfaceClass("sky", "bg-transparent");
  if (status === "rejected") return toneSurfaceClass("danger", "bg-transparent");
  return "border-border/40";
}

export function agentRunInteractionApprovalRailClass(status: string | undefined): string {
  if (status === "approved") return accentDotClass("sky");
  if (status === "rejected") return toneDotClass("danger");
  if (status === "pending") return accentDotClass("sky");
  return toneDotClass("neutral");
}

export function agentRunInteractionApprovalBadgeClass(status: string | undefined): string {
  if (status === "approved") return accentBadgeClass("sky", "bg-transparent");
  if (status === "rejected") return cn(toneSurfaceClass("danger"), toneTextClass("danger"));
  if (status === "pending") return accentBadgeClass("sky", "bg-transparent");
  return "border-border/40 bg-transparent text-muted-foreground";
}

export function agentRunInteractionApprovalInputChoiceClass(selected: boolean): string | undefined {
  if (!selected) return undefined;
  return cn(accentSurfaceClass("sky"), accentTextClass("sky"), "hover:bg-muted/25");
}

export function agentRunInteractionApprovalInputAnswerClass(): string {
  return cn(accentSurfaceClass("sky"), accentTextClass("sky"));
}

export function agentRunInteractionApprovalInputItemClass(status: string): string {
  if (status === "answered") return accentSurfaceClass("sky", "bg-transparent");
  if (status === "cancelled") return toneSurfaceClass("neutral", "bg-transparent opacity-80");
  return "border-border/40";
}

export function agentRunInteractionApprovalInputRailClass(status: string): string {
  if (status === "answered") return accentDotClass("sky");
  if (status === "cancelled") return toneDotClass("neutral");
  return accentDotClass("sky");
}

export function agentRunInteractionApprovalInputBadgeClass(status: string): string {
  if (status === "answered") return accentBadgeClass("sky", "bg-transparent");
  if (status === "cancelled") return cn(toneSurfaceClass("neutral"), toneTextClass("neutral"), "bg-transparent");
  return accentBadgeClass("sky", "bg-transparent");
}
