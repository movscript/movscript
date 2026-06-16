import type { ComponentProps, ReactNode } from "react";

import { Badge, Button, CheckboxField, CheckIcon, StatusBadge, XIcon } from "@movscript/ui/primitives";
import { AgentDataBlock, AgentSurfaceBlock } from "@movscript/ui/business/agent";
import { AppInlineMeta } from "@movscript/ui/business/app";
import { ReviewCallout } from "@movscript/ui/business/review";
import { toneTextClass, toneSurfaceClass } from "@movscript/ui/semantic";
import { cn } from "@/shared/ui/cn";
import type {
  AgentSettingsActionItem,
  AgentSettingsLabeledItem,
  AgentSettingsStatusItem,
  AgentSettingsStatusProps,
} from "./AgentSettingsUi.types";
import { agentSettingsRecipe } from "./AgentSettingsUi.recipes";

export function AgentSettingsModelRouteCard({
  title,
  statusLabel,
  statusVariant = "outline",
  sourceLabel,
  modelLabel,
}: {
  title: ReactNode;
  statusLabel: ReactNode;
  statusVariant?: ComponentProps<typeof Badge>["variant"];
  sourceLabel: ReactNode;
  modelLabel?: ReactNode;
}) {
  return (
    <AgentDataBlock>
      <span className="ms-action-row agent-settings-model-route__header">
        <span className="ms-text-truncate ms-type-label agent-settings-card-title">{title}</span>
        <Badge variant={statusVariant} className="ms-type-tiny agent-settings-model-route__badge">
          {statusLabel}
        </Badge>
      </span>
      <span className="ms-text-truncate ms-type-tiny agent-settings-card-meta">{sourceLabel}</span>
      {modelLabel ? <span className="ms-text-truncate ms-type-tiny agent-settings-card-meta">{modelLabel}</span> : null}
    </AgentDataBlock>
  );
}

export function AgentSettingsToggleRow({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <AgentDataBlock asChild>
      <CheckboxField
        checked={checked}
        onCheckedChange={onChange}
        variant="subtle"
        className="agent-settings-toggle-row"
      >
        <span className="agent-settings-item-body">
          <span className="ms-type-label agent-settings-item-title">{title}</span>
          <span className="ms-type-caption agent-settings-item-detail">{description}</span>
        </span>
      </CheckboxField>
    </AgentDataBlock>
  );
}

export function AgentSettingsApiModeCapabilityMatrix({
  title,
  description,
  badgeLabel,
  badgeProps,
  items,
}: {
  title: ReactNode;
  description: ReactNode;
  badgeLabel: ReactNode;
  badgeProps?: AgentSettingsStatusProps;
  items: AgentSettingsLabeledItem[];
}) {
  const statusProps = badgeProps ?? agentSettingsRecipe("neutral");

  return (
    <AgentDataBlock data-testid="agent-settings-api-mode-capabilities">
      <div className="agent-settings-panel-header">
        <span className="agent-settings-item-body">
          <span className="ms-type-label agent-settings-item-title">{title}</span>
          <span className="ms-type-caption agent-settings-item-detail">{description}</span>
        </span>
        <StatusBadge {...statusProps} className="agent-settings-status-badge">
          {badgeLabel}
        </StatusBadge>
      </div>
      <div className="agent-settings-grid agent-settings-grid--two" data-testid="agent-settings-api-mode-capability-items">
        {items.map((item) => (
          <AgentSurfaceBlock key={item.id} data-testid="agent-settings-api-mode-capability-item" variant="card" className="agent-settings-subitem">
            <span className="ms-type-caption agent-settings-subitem-title">{item.label}</span>
            {item.detail ? <span className="ms-type-tiny agent-settings-subitem-detail">{item.detail}</span> : null}
          </AgentSurfaceBlock>
        ))}
      </div>
    </AgentDataBlock>
  );
}

export function AgentSettingsStatusPanel({
  testId,
  itemTestId,
  title,
  description,
  items,
}: {
  testId?: string;
  itemTestId?: string;
  title: ReactNode;
  description?: ReactNode;
  items: AgentSettingsStatusItem[];
}) {
  return (
    <AgentSurfaceBlock data-testid={testId} className="agent-settings-panel">
      <span className="ms-type-label agent-settings-item-title">{title}</span>
      {description ? <span className="ms-type-caption agent-settings-item-detail">{description}</span> : null}
      <div className="agent-settings-grid agent-settings-grid--two">
        {items.map((item) => (
          <AgentSurfaceBlock key={item.id} data-testid={itemTestId} variant="subtle" className="agent-settings-subitem">
            <span className="ms-action-row agent-settings-status-row">
              <span className="agent-settings-item-body">
                <span className="ms-type-caption agent-settings-subitem-title">{item.label}</span>
                {item.detail ? <span className="ms-type-tiny agent-settings-subitem-detail">{item.detail}</span> : null}
              </span>
              <StatusBadge {...item.statusProps} className="agent-settings-status-badge">
                {item.statusLabel}
              </StatusBadge>
            </span>
          </AgentSurfaceBlock>
        ))}
      </div>
    </AgentSurfaceBlock>
  );
}

export function AgentSettingsMigrationGuide({
  apiKind,
  title,
  description,
  steps,
  switchLabel,
  onSwitch,
}: {
  apiKind: string;
  title: ReactNode;
  description: ReactNode;
  steps: Array<AgentSettingsLabeledItem & { eyebrow?: ReactNode }>;
  switchLabel?: ReactNode;
  onSwitch?: () => void;
}) {
  return (
    <AgentSurfaceBlock data-testid="agent-settings-api-mode-migration-guide" data-api-kind={apiKind} className="agent-settings-panel agent-settings-panel--spacious">
      <div className="agent-settings-panel-header">
        <span className="agent-settings-item-body">
          <span className="ms-type-label agent-settings-item-title">{title}</span>
          <span className="ms-type-caption agent-settings-item-detail">{description}</span>
        </span>
        {switchLabel && onSwitch ? (
          <Button type="button" size="sm" variant="outline" onClick={onSwitch} data-testid="agent-settings-switch-responses-from-migration">
            {switchLabel}
          </Button>
        ) : null}
      </div>
      <div className="agent-settings-grid agent-settings-grid--three">
        {steps.map((step) => (
          <AgentSurfaceBlock key={step.id} data-testid="agent-settings-api-mode-migration-step" variant="subtle" className="agent-settings-subitem">
            {step.eyebrow ? <span className="ms-type-tiny agent-settings-eyebrow">{step.eyebrow}</span> : null}
            <span className="ms-type-caption agent-settings-subitem-title">{step.label}</span>
          </AgentSurfaceBlock>
        ))}
      </div>
    </AgentSurfaceBlock>
  );
}

export function AgentSettingsSwitchPlanPanel({
  title,
  description,
  copyLabel,
  copiedLabel,
  copied,
  copyIcon,
  onCopy,
  items,
}: {
  title: ReactNode;
  description: ReactNode;
  copyLabel: ReactNode;
  copiedLabel: ReactNode;
  copied?: boolean;
  copyIcon?: ReactNode;
  onCopy: () => void;
  items: AgentSettingsStatusItem[];
}) {
  return (
    <AgentSurfaceBlock data-testid="agent-settings-api-mode-switch-taskGraph" className="agent-settings-panel agent-settings-panel--spacious">
      <div className="agent-settings-panel-header">
        <span className="agent-settings-item-body">
          <span className="ms-type-label agent-settings-item-title">{title}</span>
          <span className="ms-type-caption agent-settings-item-detail">{description}</span>
        </span>
        <Button type="button" size="sm" variant="outline" onClick={onCopy} data-testid="agent-settings-copy-api-mode-switch-taskGraph">
          {copyIcon}
          {copied ? copiedLabel : copyLabel}
        </Button>
      </div>
      <div className="agent-settings-grid agent-settings-grid--two">
        {items.map((item) => (
          <AgentSurfaceBlock key={item.id} data-testid="agent-settings-api-mode-switch-taskGraph-item" variant="subtle" className="agent-settings-subitem">
            <span className="ms-action-row agent-settings-status-row">
              <span className="agent-settings-item-body">
                <span className="ms-type-caption agent-settings-subitem-title">{item.label}</span>
                {item.detail ? <span className="ms-type-tiny agent-settings-subitem-detail">{item.detail}</span> : null}
              </span>
              <StatusBadge {...item.statusProps} className="agent-settings-status-badge">
                {item.statusLabel}
              </StatusBadge>
            </span>
          </AgentSurfaceBlock>
        ))}
      </div>
    </AgentSurfaceBlock>
  );
}

export function AgentSettingsReadinessPanel({
  items,
  copied,
  copyLabel,
  copiedLabel,
  copyIcon,
  onCopy,
}: {
  items: AgentSettingsStatusItem[];
  copied?: boolean;
  copyLabel: ReactNode;
  copiedLabel: ReactNode;
  copyIcon?: ReactNode;
  onCopy: () => void;
}) {
  return (
    <div className="agent-settings-stack">
      <div className="ms-action-row agent-settings-copy-row">
        <Button type="button" size="sm" variant="outline" onClick={onCopy} data-testid="agent-settings-copy-readiness">
          {copyIcon}
          {copied ? copiedLabel : copyLabel}
        </Button>
      </div>
      {items.map((item) => <AgentSettingsReadinessRow key={item.id} item={item} />)}
    </div>
  );
}

export function AgentSettingsReadinessRow({ item }: { item: AgentSettingsStatusItem }) {
  const icon = item.statusProps.intent === "success"
    ? <CheckIcon className={toneTextClass("success")} />
    : <XIcon className={toneTextClass(item.statusProps.intent === "danger" ? "danger" : "warning")} />;
  return (
    <AgentDataBlock className="ms-action-row agent-settings-readiness-row">
      <span className="agent-settings-readiness-icon">{icon}</span>
      <span className="agent-settings-item-body">
        <span className="ms-type-label agent-settings-item-title">{item.label}</span>
        {item.detail ? <span className="ms-type-caption agent-settings-item-detail">{item.detail}</span> : null}
      </span>
    </AgentDataBlock>
  );
}

export function AgentSettingsActionItemsPanel({
  items,
  feedback,
  emptyLabel,
  countLabel,
  copied,
  copyLabel,
  copiedLabel,
  copyIcon,
  onCopy,
}: {
  items: AgentSettingsActionItem[];
  feedback?: ReactNode;
  emptyLabel: ReactNode;
  countLabel: ReactNode;
  copied?: boolean;
  copyLabel: ReactNode;
  copiedLabel: ReactNode;
  copyIcon?: ReactNode;
  onCopy: () => void;
}) {
  const copyButton = (
    <Button type="button" size="sm" variant="outline" onClick={onCopy} data-testid="agent-settings-copy-action-items">
      {copyIcon}
      {copied ? copiedLabel : copyLabel}
    </Button>
  );

  if (items.length === 0) {
    return (
      <div data-testid="agent-settings-action-items" className="agent-settings-stack">
        <div className="ms-action-row agent-settings-copy-row">{copyButton}</div>
        <ReviewCallout tone="success" compact className="ms-type-label agent-settings-action-empty">
          {emptyLabel}
        </ReviewCallout>
        {feedback ? <AgentSettingsActionFeedback>{feedback}</AgentSettingsActionFeedback> : null}
      </div>
    );
  }

  return (
    <div data-testid="agent-settings-action-items" className="agent-settings-stack">
      {feedback ? <AgentSettingsActionFeedback>{feedback}</AgentSettingsActionFeedback> : null}
      <div className="ms-action-row agent-settings-row-between agent-settings-action-header">
        <span data-testid="agent-settings-action-items-counts" className="ms-type-caption agent-settings-action-count">
          {countLabel}
        </span>
        {copyButton}
      </div>
      {items.map((item) => <AgentSettingsActionItemRow key={item.id} item={item} />)}
    </div>
  );
}

export function AgentSettingsActionItemRow({ item }: { item: AgentSettingsActionItem }) {
  return (
    <AgentSurfaceBlock
      data-testid="agent-settings-action-item"
      className={cn(
        "agent-settings-action-item",
        item.statusProps.intent === "danger" ? toneSurfaceClass("danger") : toneSurfaceClass("warning"),
      )}
    >
      <span className="ms-action-row agent-settings-status-row">
        <span className="agent-settings-item-body">
          <span className="ms-type-label agent-settings-item-title">{item.label}</span>
          {item.detail ? <span className="ms-type-caption agent-settings-item-detail">{item.detail}</span> : null}
          {item.reasons && item.reasons.length > 0 ? (
            <span data-testid="agent-settings-action-item-reasons" className="agent-settings-reason-list">
              {item.reasons.map((reason, index) => (
                <AppInlineMeta key={index} className="ms-type-tiny agent-settings-reason">
                  {reason}
                </AppInlineMeta>
              ))}
            </span>
          ) : null}
          {item.persistHint ? (
            <span data-testid="agent-settings-action-persist-hint" className={cn("ms-type-tiny agent-settings-persist-hint", toneTextClass("warning"))}>
              {item.persistHint}
            </span>
          ) : null}
        </span>
        <StatusBadge {...item.statusProps} className="agent-settings-status-badge">
          {item.statusLabel}
        </StatusBadge>
      </span>
      <span className="ms-action-row agent-settings-action-controls">
        <Button type="button" size="sm" variant="outline" onClick={item.onJump} data-testid="agent-settings-action-jump">
          {item.jumpLabel}
        </Button>
        {item.quickFixLabel && item.onQuickFix ? (
          <Button type="button" size="sm" variant="soft" onClick={item.onQuickFix} data-testid="agent-settings-action-quick-fix">
            {item.quickFixLabel}
          </Button>
        ) : null}
      </span>
    </AgentSurfaceBlock>
  );
}

export function AgentSettingsActionFeedback({ children }: { children: ReactNode }) {
  return (
    <ReviewCallout data-testid="agent-settings-action-feedback" role="status" tone="success" compact className="ms-type-caption agent-settings-action-feedback">
      {children}
    </ReviewCallout>
  );
}
