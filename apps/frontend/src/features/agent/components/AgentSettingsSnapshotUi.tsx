import type { ReactNode } from "react";

import { Badge, Button, CheckboxField, StatusBadge } from "@movscript/ui/primitives";
import { toneSurfaceClass } from "@movscript/ui/semantic";
import { AgentDataBlock, AgentSurfaceBlock } from "@movscript/ui/business/agent";
import { AppKeyValue } from "@movscript/ui/business/app";
import { cn } from "@/shared/ui/cn";
import type {
  AgentSettingsAuditTrailItem,
  AgentSettingsSnapshotImpactItem,
  AgentSettingsSnapshotPresetItem,
  AgentSettingsSnapshotScopeItem,
  AgentSettingsSnapshotSummaryItem,
} from "./AgentSettingsUi.types";

export function AgentSettingsSnapshotImportScopePanel({
  title,
  description,
  presetsLabel,
  presetsHelp,
  presets,
  scopes,
}: {
  title: ReactNode;
  description: ReactNode;
  presetsLabel: ReactNode;
  presetsHelp: ReactNode;
  presets: AgentSettingsSnapshotPresetItem[];
  scopes: AgentSettingsSnapshotScopeItem[];
}) {
  return (
    <AgentSurfaceBlock data-testid="agent-settings-snapshot-import-scopes" className="agent-settings-snapshot-import">
      <span className="ms-type-label agent-settings-item-title">{title}</span>
      <span className="ms-type-caption agent-settings-item-detail">{description}</span>
      <div data-testid="agent-settings-snapshot-import-presets" className="ms-action-row agent-settings-action-group agent-settings-snapshot-import__presets">
        <span className="ms-text-truncate ms-type-tiny agent-settings-card-meta">{presetsLabel}</span>
        {presets.map((preset) => (
          <Button
            key={preset.id}
            type="button"
            size="sm"
            variant="outline"
            disabled={!preset.enabled}
            onClick={preset.onSelect}
            data-testid="agent-settings-snapshot-import-preset"
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <p className="ms-text-truncate ms-type-tiny agent-settings-card-meta">{presetsHelp}</p>
      <div className="agent-settings-snapshot-import__scope-grid">
        {scopes.map((scope) => (
          <AgentSurfaceBlock
            key={scope.id}
            asChild
            variant="subtle"
            className={cn("agent-settings-snapshot-import__scope", !scope.available ? "agent-settings-snapshot-import__scope--disabled" : undefined)}
          >
            <CheckboxField
              data-testid="agent-settings-snapshot-import-scope"
              data-scope={scope.scope}
              checked={scope.checked}
              disabled={!scope.available}
              onCheckedChange={scope.onChange}
              variant="subtle"
              className="agent-settings-snapshot-import__scope-control"
            >
              <span className="agent-settings-item-body">
                <span className="ms-type-label agent-settings-card-title agent-settings-card-title--wrap">{scope.label}</span>
                <span className="ms-text-truncate ms-type-tiny agent-settings-card-meta">{scope.detail}</span>
              </span>
            </CheckboxField>
          </AgentSurfaceBlock>
        ))}
      </div>
    </AgentSurfaceBlock>
  );
}

export function AgentSettingsSnapshotSummaryPanel({
  title,
  items,
}: {
  title: ReactNode;
  items: AgentSettingsSnapshotSummaryItem[];
}) {
  return (
    <AgentDataBlock data-testid="agent-settings-snapshot-summary">
      <p className="ms-type-label agent-settings-item-title">{title}</p>
      <div className="ms-type-caption agent-settings-snapshot-summary__grid">
        {items.map((item) => (
          <AppKeyValue key={item.id} label={item.label} value={item.value} />
        ))}
      </div>
    </AgentDataBlock>
  );
}

export function AgentSettingsAuditTrailPanel({
  entries,
  emptyLabel,
  help,
  copyLabel,
  copiedLabel,
  copied = false,
  clearLabel,
  copyIcon,
  clearIcon,
  onCopy,
  onClear,
}: {
  entries: AgentSettingsAuditTrailItem[];
  emptyLabel: ReactNode;
  help: ReactNode;
  copyLabel: ReactNode;
  copiedLabel: ReactNode;
  copied?: boolean;
  clearLabel: ReactNode;
  copyIcon?: ReactNode;
  clearIcon?: ReactNode;
  onCopy: () => void;
  onClear: () => void;
}) {
  if (entries.length === 0) {
    return (
      <div data-testid="agent-settings-audit-trail" className="agent-settings-audit-trail">
        <AgentDataBlock className="ms-type-label agent-settings-audit-trail__empty">
          {emptyLabel}
        </AgentDataBlock>
      </div>
    );
  }
  return (
    <div data-testid="agent-settings-audit-trail" className="agent-settings-audit-trail">
      <div className="ms-action-row agent-settings-row-between">
        <span className="ms-type-caption agent-settings-audit-trail__help">{help}</span>
        <span className="ms-action-row agent-settings-action-group">
          <Button type="button" size="sm" variant="outline" onClick={onCopy} data-testid="agent-settings-copy-audit">
            {copyIcon}
            {copied ? copiedLabel : copyLabel}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onClear} data-testid="agent-settings-clear-audit">
            {clearIcon}
            {clearLabel}
          </Button>
        </span>
      </div>
      <div className="agent-settings-audit-trail__list">
        {entries.slice(0, 8).map((entry) => (
          <AgentSurfaceBlock
            key={entry.id}
            variant="subtle"
            data-testid="agent-settings-audit-entry"
            data-audit-status={entry.failed ? "failed" : "ok"}
            className={cn("agent-settings-audit-trail__entry", entry.failed ? toneSurfaceClass("danger") : undefined)}
          >
            <div className="ms-action-row agent-settings-row-between">
              <span className="agent-settings-item-body">
                <span className="ms-type-caption agent-settings-subitem-title">{entry.summary}</span>
                <span className="ms-text-truncate ms-type-tiny agent-settings-card-meta">{entry.createdAtLabel}</span>
              </span>
              <span className="ms-action-row agent-settings-action-group">
                <Badge>{entry.targetLabel}</Badge>
                <Badge tone={entry.failed ? "danger" : "neutral"} variant={entry.failed ? "soft" : "outline"}>{entry.actionLabel}</Badge>
              </span>
            </div>
          </AgentSurfaceBlock>
        ))}
      </div>
    </div>
  );
}

export function AgentSettingsSnapshotImpactPanel({
  title,
  copyLabel,
  copiedLabel,
  copied = false,
  copyIcon,
  onCopy,
  items,
}: {
  title: ReactNode;
  copyLabel: ReactNode;
  copiedLabel: ReactNode;
  copied?: boolean;
  copyIcon?: ReactNode;
  onCopy: () => void;
  items: AgentSettingsSnapshotImpactItem[];
}) {
  return (
    <AgentSurfaceBlock data-testid="agent-settings-snapshot-impact" className="agent-settings-snapshot-impact">
      <div className="ms-action-row agent-settings-row-between agent-settings-snapshot-impact__header">
        <p className="ms-type-label agent-settings-item-title">{title}</p>
        <Button type="button" size="sm" variant="outline" onClick={onCopy} data-testid="agent-settings-copy-snapshot-impact">
          {copyIcon}
          {copied ? copiedLabel : copyLabel}
        </Button>
      </div>
      <div className="agent-settings-snapshot-impact__list">
        {items.map((item) => (
          <AgentSurfaceBlock key={item.id} data-testid="agent-settings-snapshot-impact-item" variant="subtle" className="ms-action-row agent-settings-row-between agent-settings-snapshot-impact__item">
            <span className="agent-settings-item-body">
              <span className="ms-type-caption agent-settings-subitem-title">{item.label}</span>
              <span className="ms-type-tiny agent-settings-subitem-detail">{item.detail}</span>
            </span>
            <StatusBadge {...item.statusProps} className="agent-settings-status-badge">
              {item.scopeLabel}
            </StatusBadge>
          </AgentSurfaceBlock>
        ))}
      </div>
    </AgentSurfaceBlock>
  );
}
