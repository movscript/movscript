import type { ReactNode } from "react";

import type { StatusBadgeProps } from "@movscript/ui/primitives";

export type AgentSettingsStatusTone = "neutral" | "success" | "warning" | "danger";
export type AgentSettingsStatusProps = Pick<StatusBadgeProps, "intent" | "emphasis">;

export type AgentSettingsLabeledItem = {
  id: string;
  label: ReactNode;
  detail?: ReactNode;
};

export type AgentSettingsStatusItem = AgentSettingsLabeledItem & {
  statusProps: AgentSettingsStatusProps;
  statusLabel: ReactNode;
};

export type AgentSettingsActionItem = AgentSettingsStatusItem & {
  reasons?: ReactNode[];
  persistHint?: ReactNode;
  jumpLabel: ReactNode;
  onJump: () => void;
  quickFixLabel?: ReactNode;
  onQuickFix?: () => void;
};

export type AgentSettingsSkillMetaItem = {
  id: string;
  label: ReactNode;
};

export type AgentSettingsToolPermissionsDiffItem = {
  id: string;
  name: ReactNode;
  beforeLabel: ReactNode;
  afterLabel: ReactNode;
  changeLabel: ReactNode;
  statusProps: AgentSettingsStatusProps;
};

export type AgentSettingsToolPermissionsMode = "allow" | "deny";
export type AgentSettingsToolPermissionsApproval = "never" | "on_write" | "always";

export type AgentSettingsToolPermissionsMetaItem = {
  id: string;
  label: ReactNode;
  tone?: AgentSettingsStatusTone;
};

export type AgentSettingsToolPermissionsFilterOption = {
  value: string;
  label: ReactNode;
};

export type AgentSettingsToolPermissionsFilterPresetItem = {
  id: string;
  name: ReactNode;
  title?: string;
  onSelect: () => void;
  onDelete: () => void;
};

export type AgentSettingsToolPermissionsBulkActionItem = {
  id: string;
  label: ReactNode;
  disabled?: boolean;
  onClick: () => void;
};

export type AgentSettingsSnapshotPresetItem = {
  id: string;
  label: ReactNode;
  enabled: boolean;
  onSelect: () => void;
};

export type AgentSettingsSnapshotScopeItem = {
  id: string;
  scope: string;
  label: ReactNode;
  detail: ReactNode;
  checked: boolean;
  available: boolean;
  onChange: (checked: boolean) => void;
};

export type AgentSettingsSnapshotSummaryItem = {
  id: string;
  label: ReactNode;
  value: ReactNode;
};

export type AgentSettingsAuditTrailItem = {
  id: string;
  summary: ReactNode;
  createdAtLabel: ReactNode;
  targetLabel: ReactNode;
  actionLabel: ReactNode;
  failed?: boolean;
};

export type AgentSettingsSnapshotImpactItem = {
  id: string;
  label: ReactNode;
  detail: ReactNode;
  scopeLabel: ReactNode;
  statusProps: AgentSettingsStatusProps;
};

