import type { ReactNode } from "react";

import { Badge, CheckboxField, StatusBadge, Textarea } from "@movscript/ui/primitives";
import { AgentDataBlock, AgentSurfaceBlock } from "@movscript/ui/business/agent";
import { AppInlineMeta } from "@movscript/ui/business/app";
import { cn } from "@/shared/ui/cn";
import type { AgentSettingsSkillMetaItem } from "./AgentSettingsUi.types";
import { agentSettingsBooleanStatusRecipe } from "./AgentSettingsUi.recipes";

export function AgentSettingsSkillCard({
  name,
  idLabel,
  description,
  enabled,
  enabledLabel,
  disabledLabel,
  loadModeLabel,
  versionLabel,
  sourceLabel,
  priorityLabel,
  workspaceEnabled,
  workspaceDisabled,
  workspaceTitle,
  workspaceHelp,
  workspaceLocked = false,
  onWorkspaceChange,
  instructionLabel,
  instructionHelp,
  instructionValue,
  instructionDisabled,
  onInstructionChange,
  metaItems,
  compact = false,
  selected = false,
  onSelect,
}: {
  name: ReactNode;
  idLabel: ReactNode;
  description?: ReactNode;
  enabled: boolean;
  enabledLabel: ReactNode;
  disabledLabel: ReactNode;
  loadModeLabel?: ReactNode;
  versionLabel?: ReactNode;
  sourceLabel: ReactNode;
  priorityLabel?: ReactNode;
  workspaceEnabled?: boolean;
  workspaceDisabled?: boolean;
  workspaceTitle?: ReactNode;
  workspaceHelp?: ReactNode;
  workspaceLocked?: boolean;
  onWorkspaceChange?: (enabled: boolean) => void;
  instructionLabel?: ReactNode;
  instructionHelp?: ReactNode;
  instructionValue?: string;
  instructionDisabled?: boolean;
  onInstructionChange?: (value: string) => void;
  metaItems?: AgentSettingsSkillMetaItem[];
  compact?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <AgentDataBlock
      className="agent-settings-skill-card"
      data-compact={compact ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={onSelect ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      } : undefined}
    >
      <div className="ms-action-row agent-settings-row-between">
        <div className="agent-settings-item-body">
          <div className="ms-action-row agent-settings-title-row">
            <p className="ms-text-truncate ms-type-label agent-settings-card-title">{name}</p>
            <StatusBadge {...agentSettingsBooleanStatusRecipe(enabled)}>{enabled ? enabledLabel : disabledLabel}</StatusBadge>
            {loadModeLabel ? <Badge variant="outline">{loadModeLabel}</Badge> : null}
            {versionLabel ? <Badge variant="outline">{versionLabel}</Badge> : null}
            <Badge variant="outline">{sourceLabel}</Badge>
          </div>
          <p className="ms-text-truncate ms-type-tiny agent-settings-card-meta">{idLabel}</p>
        </div>
        {priorityLabel ? <span className="ms-text-truncate ms-type-tiny agent-settings-card-meta">{priorityLabel}</span> : null}
      </div>
      {!compact && description ? <p className="ms-type-caption agent-settings-card-description">{description}</p> : null}
      {!compact && typeof workspaceEnabled === "boolean" && onWorkspaceChange ? (
        <AgentSurfaceBlock variant="card" className="agent-settings-skill-card__workspace">
          <CheckboxField
            checked={workspaceEnabled}
            disabled={workspaceDisabled}
            onCheckedChange={onWorkspaceChange}
            controlSize="sm"
            className={cn("ms-type-caption agent-settings-skill-card__toggle", workspaceLocked ? "agent-settings-skill-card__toggle--locked" : undefined)}
          >
            <span className="agent-settings-skill-card__workspace-copy">
              {workspaceTitle ? <span className="ms-type-caption agent-settings-subitem-title">{workspaceTitle}</span> : null}
              {workspaceHelp ? <span className="ms-type-tiny agent-settings-subitem-detail">{workspaceHelp}</span> : null}
            </span>
          </CheckboxField>
        </AgentSurfaceBlock>
      ) : null}
      {!compact && instructionValue !== undefined && onInstructionChange ? (
        <label className="agent-settings-skill-card__instruction">
          {instructionLabel ? <span className="ms-type-caption agent-settings-subitem-title">{instructionLabel}</span> : null}
          {instructionHelp ? <span className="ms-type-tiny agent-settings-subitem-detail">{instructionHelp}</span> : null}
          <Textarea
            value={instructionValue}
            disabled={instructionDisabled}
            onChange={(event) => onInstructionChange(event.target.value)}
            data-testid="agent-settings-skill-instruction-editor"
            className="ms-type-caption"
          />
        </label>
      ) : null}
      {!compact && metaItems && metaItems.length > 0 ? (
        <div className="ms-type-tiny agent-settings-skill-card__meta">
          {metaItems.map((item) => (
            <AppInlineMeta key={item.id}>{item.label}</AppInlineMeta>
          ))}
        </div>
      ) : null}
    </AgentDataBlock>
  );
}
