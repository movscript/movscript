import type { ReactNode } from "react";

import { Badge, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, StatusBadge, XIcon } from "@movscript/ui/primitives";
import { toneTextClass, toneSurfaceClass } from "@movscript/ui/semantic";
import { AgentSurfaceBlock } from "@movscript/ui/business/agent";
import { AppInlineMeta } from "@movscript/ui/business/app";
import { cn } from "@/shared/ui/cn";
import type {
  AgentSettingsToolPermissionsApproval,
  AgentSettingsToolPermissionsBulkActionItem,
  AgentSettingsToolPermissionsDiffItem,
  AgentSettingsToolPermissionsFilterOption,
  AgentSettingsToolPermissionsFilterPresetItem,
  AgentSettingsToolPermissionsMetaItem,
  AgentSettingsToolPermissionsMode,
} from "./AgentSettingsUi.types";
import {
  agentSettingsApprovalStatusRecipe,
  agentSettingsAvailabilityStatusRecipe,
} from "./AgentSettingsUi.recipes";

export function AgentSettingsToolPermissionsDiffPanel({
  title,
  summary,
  copyLabel,
  copiedLabel,
  copied = false,
  copyIcon,
  onCopy,
  items,
}: {
  title: ReactNode;
  summary: ReactNode;
  copyLabel: ReactNode;
  copiedLabel: ReactNode;
  copied?: boolean;
  copyIcon?: ReactNode;
  onCopy: () => void;
  items: AgentSettingsToolPermissionsDiffItem[];
}) {
  if (items.length === 0) return null;
  return (
    <AgentSurfaceBlock data-testid="agent-settings-tool-permissions-diff" className="agent-settings-tool-permissions-diff">
      <div className="ms-action-row agent-settings-row-between">
        <span className="agent-settings-item-body">
          <span className="ms-type-label agent-settings-item-title">{title}</span>
          <span className="ms-type-caption agent-settings-item-detail">{summary}</span>
        </span>
        <Button type="button" size="sm" variant="outline" onClick={onCopy} data-testid="agent-settings-copy-tool-permissions-diff">
          {copyIcon}
          {copied ? copiedLabel : copyLabel}
        </Button>
      </div>
      <div className="agent-settings-tool-permissions-diff__list">
        {items.slice(0, 8).map((item) => (
          <AgentSurfaceBlock key={item.id} data-testid="agent-settings-tool-permissions-diff-item" variant="subtle" className="ms-action-row agent-settings-tool-permissions-diff__item agent-settings-row-between">
            <span className="agent-settings-item-body">
              <span className="ms-type-caption agent-settings-subitem-title">{item.name}</span>
              <span className="ms-type-tiny agent-settings-subitem-detail">
                {item.beforeLabel} {"->"} {item.afterLabel}
              </span>
            </span>
            <StatusBadge {...item.statusProps} className="agent-settings-status-badge">
              {item.changeLabel}
            </StatusBadge>
          </AgentSurfaceBlock>
        ))}
      </div>
    </AgentSurfaceBlock>
  );
}

export function AgentSettingsToolPermissionsRow({
  name,
  sourceLabel,
  permissionLabel,
  riskLabel,
  approvalStatusLabel,
  available,
  availableLabel,
  blockedLabel,
  configFileGranted,
  configFileGrantedLabel,
  requiresApproval,
  description,
  workspace,
  modeLabel,
  approvalLabel,
  allowLabel,
  denyLabel,
  approvalNeverLabel,
  approvalOnWriteLabel,
  approvalAlwaysLabel,
  allowDisabledHelp,
  onModeChange,
  onApprovalChange,
  metaItems,
  compact = false,
  selected = false,
  onSelect,
}: {
  name: ReactNode;
  sourceLabel: ReactNode;
  permissionLabel: ReactNode;
  riskLabel: ReactNode;
  approvalStatusLabel: ReactNode;
  available: boolean;
  availableLabel: ReactNode;
  blockedLabel: ReactNode;
  configFileGranted?: boolean;
  configFileGrantedLabel?: ReactNode;
  requiresApproval?: boolean;
  description?: ReactNode;
  workspace?: {
    mode: AgentSettingsToolPermissionsMode;
    approval: AgentSettingsToolPermissionsApproval;
    canAllow: boolean;
  };
  modeLabel: ReactNode;
  approvalLabel: ReactNode;
  allowLabel: ReactNode;
  denyLabel: ReactNode;
  approvalNeverLabel: ReactNode;
  approvalOnWriteLabel: ReactNode;
  approvalAlwaysLabel: ReactNode;
  allowDisabledHelp?: ReactNode;
  onModeChange?: (mode: AgentSettingsToolPermissionsMode) => void;
  onApprovalChange?: (approval: AgentSettingsToolPermissionsApproval) => void;
  metaItems: AgentSettingsToolPermissionsMetaItem[];
  compact?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <AgentSurfaceBlock
      variant="subtle"
      className={cn("agent-settings-tool-permissions-row", !available ? toneSurfaceClass("warning") : undefined)}
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
            <StatusBadge {...agentSettingsAvailabilityStatusRecipe(available)}>{available ? availableLabel : blockedLabel}</StatusBadge>
            {configFileGranted && configFileGrantedLabel ? <Badge>{configFileGrantedLabel}</Badge> : null}
          </div>
          <p className="ms-text-truncate ms-type-tiny agent-settings-card-meta">
            {sourceLabel} / {permissionLabel} / {riskLabel}
          </p>
        </div>
        <StatusBadge {...agentSettingsApprovalStatusRecipe(Boolean(requiresApproval))}>{approvalStatusLabel}</StatusBadge>
      </div>
      {!compact && description ? <p className="ms-type-caption agent-settings-card-description">{description}</p> : null}
      {!compact && workspace ? (
        <div className="agent-settings-tool-permissions-row__controls">
          <div>
            <label className="ms-type-tiny agent-settings-tool-permissions-row__field-label">{modeLabel}</label>
            <Select value={workspace.mode} onValueChange={(value) => onModeChange?.(value as AgentSettingsToolPermissionsMode)}>
              <SelectTrigger className="ms-type-label agent-settings-tool-permissions-row__select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allow" disabled={!workspace.canAllow}>{allowLabel}</SelectItem>
                <SelectItem value="deny">{denyLabel}</SelectItem>
              </SelectContent>
            </Select>
            {!workspace.canAllow && allowDisabledHelp ? (
              <p className="ms-type-tiny agent-settings-tool-permissions-row__help">{allowDisabledHelp}</p>
            ) : null}
          </div>
          <div>
            <label className="ms-type-tiny agent-settings-tool-permissions-row__field-label">{approvalLabel}</label>
            <Select value={workspace.approval} onValueChange={(value) => onApprovalChange?.(value as AgentSettingsToolPermissionsApproval)}>
              <SelectTrigger className="ms-type-label agent-settings-tool-permissions-row__select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">{approvalNeverLabel}</SelectItem>
                <SelectItem value="on_write">{approvalOnWriteLabel}</SelectItem>
                <SelectItem value="always">{approvalAlwaysLabel}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}
      {!compact && metaItems.length > 0 ? (
        <div className="ms-action-row ms-type-tiny agent-settings-tool-permissions-row__meta">
          {metaItems.map((item) => (
            <AppInlineMeta key={item.id} className={item.tone === "warning" ? toneTextClass("warning") : undefined}>
              {item.label}
            </AppInlineMeta>
          ))}
        </div>
      ) : null}
    </AgentSurfaceBlock>
  );
}

export function AgentSettingsToolPermissionsFilterPanel({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filterValue,
  onFilterChange,
  filterOptions,
  summary,
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filterValue: string;
  onFilterChange: (value: string) => void;
  filterOptions: AgentSettingsToolPermissionsFilterOption[];
  summary: ReactNode;
}) {
  return (
    <AgentSurfaceBlock data-testid="agent-settings-tool-permissions-filters" className="agent-settings-tool-permissions-filter">
      <Input
        value={searchValue}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={searchPlaceholder}
        className="ms-type-label agent-settings-tool-permissions-filter__search"
        data-testid="agent-settings-tool-permissions-search"
      />
      <Select value={filterValue} onValueChange={onFilterChange}>
        <SelectTrigger className="ms-type-label agent-settings-tool-permissions-filter__select" data-testid="agent-settings-tool-permissions-filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {filterOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="ms-center ms-type-caption agent-settings-tool-permissions-filter__summary" data-testid="agent-settings-tool-permissions-filter-summary">
        {summary}
      </div>
    </AgentSurfaceBlock>
  );
}

export function AgentSettingsToolPermissionsFilterPresetPanel({
  title,
  saveLabel,
  saveIcon,
  help,
  emptyLabel,
  presets,
  deleteLabel,
  deleteIcon,
  onSave,
}: {
  title: ReactNode;
  saveLabel: ReactNode;
  saveIcon?: ReactNode;
  help: ReactNode;
  emptyLabel: ReactNode;
  presets: AgentSettingsToolPermissionsFilterPresetItem[];
  deleteLabel: string;
  deleteIcon?: ReactNode;
  onSave: () => void;
}) {
  return (
    <AgentSurfaceBlock data-testid="agent-settings-tool-permissions-filter-presets" className="agent-settings-tool-permissions-presets">
      <div className="ms-action-row agent-settings-tool-permissions-presets__header">
        <span className="agent-settings-item-body">
          <span className="ms-text-truncate ms-type-label agent-settings-card-title">{title}</span>
          <span className="ms-type-caption agent-settings-card-description">{help}</span>
        </span>
        <Button type="button" size="sm" variant="outline" onClick={onSave}>
          {saveIcon}
          {saveLabel}
        </Button>
      </div>
      {presets.length > 0 ? (
        <div className="ms-action-row agent-settings-tool-permissions-presets__list">
          {presets.map((preset) => (
            <AgentSurfaceBlock key={preset.id} variant="subtle" className="ms-action-row agent-settings-tool-permissions-presets__item">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="agent-settings-tool-permissions-presets__select"
                title={preset.title}
                onClick={preset.onSelect}
              >
                <span className="ms-text-truncate agent-settings-tool-permissions-presets__select-label">{preset.name}</span>
              </Button>
              <Button type="button" size="icon" variant="ghost" aria-label={deleteLabel} onClick={preset.onDelete}>
                {deleteIcon ?? <XIcon size={14} />}
              </Button>
            </AgentSurfaceBlock>
          ))}
        </div>
      ) : (
        <p className="ms-type-caption agent-settings-card-description agent-settings-tool-permissions-presets__empty">{emptyLabel}</p>
      )}
    </AgentSurfaceBlock>
  );
}

export function AgentSettingsToolPermissionsBulkActionPanel({
  title,
  help,
  actions,
}: {
  title: ReactNode;
  help: ReactNode;
  actions: AgentSettingsToolPermissionsBulkActionItem[];
}) {
  return (
    <AgentSurfaceBlock data-testid="agent-settings-tool-permissions-bulk-actions" className="ms-action-row agent-settings-tool-permissions-bulk">
      <span className="ms-type-label agent-settings-item-title">{title}</span>
      {actions.map((action) => (
        <Button key={action.id} type="button" size="sm" variant="outline" onClick={action.onClick} disabled={action.disabled}>
          {action.label}
        </Button>
      ))}
      <span className="agent-settings-inline-note">{help}</span>
    </AgentSurfaceBlock>
  );
}
