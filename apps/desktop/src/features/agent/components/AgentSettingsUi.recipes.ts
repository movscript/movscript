import type { AgentSettingsStatusProps, AgentSettingsStatusTone } from "./AgentSettingsUi.types";

export function agentSettingsStatusRecipe(status: "neutral" | "ready" | "warning" | "action"): AgentSettingsStatusProps {
  if (status === "neutral") return agentSettingsRecipe("neutral");
  if (status === "ready") return agentSettingsRecipe("success");
  if (status === "warning") return agentSettingsRecipe("warning");
  return agentSettingsRecipe("danger");
}

export function agentSettingsApiModeBadgeRecipe(badge: "recommended" | "managed" | "compatibility" | "providerNative"): AgentSettingsStatusProps {
  if (badge === "recommended") return agentSettingsRecipe("success");
  if (badge === "providerNative") return agentSettingsRecipe("warning");
  return agentSettingsRecipe("neutral");
}

export function agentSettingsBooleanStatusRecipe(enabled: boolean): AgentSettingsStatusProps {
  return agentSettingsRecipe(enabled ? "success" : "neutral");
}

export function agentSettingsAvailabilityStatusRecipe(available: boolean): AgentSettingsStatusProps {
  return agentSettingsRecipe(available ? "success" : "warning");
}

export function agentSettingsApprovalStatusRecipe(requiresApproval: boolean): AgentSettingsStatusProps {
  return agentSettingsRecipe(requiresApproval ? "warning" : "neutral");
}

export const agentSettingsRecipe = (intent: AgentSettingsStatusTone): AgentSettingsStatusProps => {
  return { intent, emphasis: "soft" };
};

