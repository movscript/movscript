import type { ChangeEvent, ComponentProps, HTMLAttributes, ReactNode, Ref } from "react";

import {
  Badge,
  Button,
  CheckboxField,
  CheckIcon,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  type StatusBadgeProps,
  Textarea,
  XIcon,
} from "../../../primitives";
import type { IconComponent } from "../../../primitives/types";
import { cn } from "../../../../lib/cn";
import { toneTextClass, toneSurfaceClass } from "../../../../semantic";
import { AgentDataBlock } from "../run";
import { AgentSurfaceBlock } from "../surface-block";
import { AppCodeBlock, AppInlineError, AppInlineMeta, AppKeyValue, AppPanel, AppStateMessage } from "../../app";
import { ReviewCallout } from "../../review";

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

export type AgentSettingsConfigFileSummaryItem = {
  id: string;
  label: ReactNode;
  value: ReactNode;
};

export type AgentSettingsConfigFileDiffSection = {
  id: string;
  label: ReactNode;
  lines: ReactNode[];
  emptyLabel: ReactNode;
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

export type AgentSettingsPackPluginItem = {
  id: string;
  path: ReactNode;
  actionLabel: ReactNode;
  actionIcon?: ReactNode;
  actionIntent?: "neutral" | "danger";
  actionVariant?: "solid" | "ghost";
  disabled?: boolean;
  onAction: () => void;
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

export function AgentSettingsPanel({
  children,
  className,
  bodyClassName,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  icon?: IconComponent;
  iconClassName?: string;
  action?: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <AppPanel
      className={cn("agent-settings-shell-panel", className)}
      bodyClassName={cn("agent-settings-shell-panel__body", bodyClassName)}
      {...props}
    >
      {children}
    </AppPanel>
  );
}

export function AgentSettingsHeaderContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-settings-header", className)} {...props} />;
}

export function AgentSettingsHeaderCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-settings-header__copy", className)} {...props} />;
}

export function AgentSettingsHeaderTitleRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-settings-header__title-row", className)} {...props} />;
}

export function AgentSettingsHeaderTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn("agent-settings-header__title", className)} {...props} />;
}

export function AgentSettingsHeaderDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-settings-header__description", className)} {...props} />;
}

export function AgentSettingsHeaderActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-settings-header__actions", className)} {...props} />;
}

export function AgentSettingsActionButton({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button type="button" size="sm" className={cn("agent-settings-action-button", className)} {...props} />;
}

export function AgentSettingsIcon({
  icon: Icon,
  spinning = false,
  selected = false,
  className,
  ...props
}: ComponentProps<IconComponent> & {
  icon: IconComponent;
  spinning?: boolean;
  selected?: boolean;
}) {
  return (
    <Icon
      className={cn(
        "agent-settings-icon",
        spinning ? "agent-settings-icon--spinning" : undefined,
        selected ? "agent-settings-icon--selected" : undefined,
        className,
      )}
      {...props}
    />
  );
}

export function AgentSettingsStatusBadge({ className, ...props }: ComponentProps<typeof StatusBadge>) {
  return <StatusBadge className={cn("agent-settings-status-badge", className)} {...props} />;
}

export function AgentSettingsBadge({ className, ...props }: ComponentProps<typeof Badge>) {
  return <Badge className={cn("agent-settings-badge", className)} {...props} />;
}

export function AgentSettingsInput({ className, ...props }: ComponentProps<typeof Input>) {
  return <Input className={cn("agent-settings-input", className)} {...props} />;
}

export function AgentSettingsTextarea({
  minRows = "default",
  className,
  ...props
}: ComponentProps<typeof Textarea> & {
  minRows?: "default" | "large";
}) {
  return (
    <Textarea
      data-min-rows={minRows}
      className={cn("agent-settings-textarea", className)}
      {...props}
    />
  );
}

export function AgentSettingsSelectTrigger({ className, ...props }: ComponentProps<typeof SelectTrigger>) {
  return <SelectTrigger className={cn("agent-settings-select-trigger", className)} {...props} />;
}

export function AgentSettingsCodeBlock({ className, ...props }: ComponentProps<typeof AppCodeBlock>) {
  return <AppCodeBlock className={cn("agent-settings-code", className)} {...props} />;
}

export function AgentSettingsLayout({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-settings-layout", className)} {...props} />;
}

export function AgentSettingsMain({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("agent-settings-main", className)} {...props} />;
}

export function AgentSettingsSidebar({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <aside className={cn("agent-settings-sidebar", className)} {...props} />;
}

export function AgentSettingsStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-settings-stack", className)} {...props} />;
}

export function AgentSettingsActionRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-settings-action-row", className)} {...props} />;
}

export function AgentSettingsFormGrid({
  columns = "two",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  columns?: "two" | "three" | "four" | "five" | "model";
}) {
  return <div data-columns={columns} className={cn("agent-settings-form-grid", className)} {...props} />;
}

export function AgentSettingsFormField({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-settings-form-field", className)} {...props} />;
}

export function AgentSettingsFieldLabel({ className, ...props }: HTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("agent-settings-field-label", className)} {...props} />;
}

export function AgentSettingsFieldHelp({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-settings-field-help", className)} {...props} />;
}

export function AgentSettingsInlineNote({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-settings-inline-note", className)} {...props} />;
}

export function AgentSettingsItemTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-settings-item-title", className)} {...props} />;
}

export function AgentSettingsItemDetail({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-settings-item-detail", className)} {...props} />;
}

export function AgentSettingsIssueList({
  items,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLUListElement>, "children"> & {
  items: ReactNode[];
}) {
  if (items.length === 0) return null;
  return (
    <ul className={cn("agent-settings-issue-list", className)} {...props}>
      {items.map((item, index) => (
        <li key={index} className="agent-settings-issue-list__item">
          {item}
        </li>
      ))}
    </ul>
  );
}

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
      <span className="agent-settings-model-route__header">
        <span className="agent-settings-model-route__title">{title}</span>
        <Badge variant={statusVariant} className="agent-settings-model-route__badge">
          {statusLabel}
        </Badge>
      </span>
      <span className="agent-settings-model-route__source">{sourceLabel}</span>
      {modelLabel ? <span className="agent-settings-model-route__model">{modelLabel}</span> : null}
    </AgentDataBlock>
  );
}

export function AgentSettingsModelOptionButton({
  title,
  detail,
  selected,
  selectedIcon,
  onSelect,
}: {
  title: ReactNode;
  detail: ReactNode;
  selected?: boolean;
  selectedIcon?: ReactNode;
  onSelect: () => void;
}) {
  return (
    <AgentSurfaceBlock
      asChild
      variant="card"
      className={cn("agent-settings-model-option", selected ? "agent-settings-model-option--selected" : undefined)}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onSelect}
        className="agent-settings-model-option__button"
      >
        <span className="agent-settings-model-option__header">
          <span className="agent-settings-model-option__title">{title}</span>
          {selected ? <span className="agent-settings-model-option__selected-icon">{selectedIcon}</span> : null}
        </span>
        <span className="agent-settings-model-option__detail">{detail}</span>
      </Button>
    </AgentSurfaceBlock>
  );
}

export function AgentSettingsNavigationList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-settings-navigation-list", className)} {...props} />;
}

export function AgentSettingsNavigationButton({
  title,
  description,
  onClick,
}: {
  title: ReactNode;
  description: ReactNode;
  onClick: () => void;
}) {
  return (
    <AgentDataBlock asChild>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClick}
        className="agent-settings-navigation-button"
      >
        <span className="agent-settings-navigation-button__title">{title}</span>
        <span className="agent-settings-navigation-button__description">{description}</span>
      </Button>
    </AgentDataBlock>
  );
}

export function AgentSettingsScopeRail({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("agent-settings-scope-rail", className)} {...props}>
      {children}
    </div>
  );
}

export function AgentSettingsScopeBadge({
  children,
  muted = false,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  muted?: boolean;
}) {
  return (
    <AppInlineMeta
      className={cn(
        "agent-settings-scope-badge",
        muted ? "agent-settings-scope-badge--muted" : "agent-settings-scope-badge--active",
        className,
      )}
      {...props}
    >
      {children}
    </AppInlineMeta>
  );
}

export function AgentSettingsStateMessage({
  className,
  ...props
}: ComponentProps<typeof AppStateMessage>) {
  return <AppStateMessage className={cn("agent-settings-state-message", className)} {...props} />;
}

export function AgentSettingsKeyValue({
  className,
  ...props
}: ComponentProps<typeof AppKeyValue>) {
  return <AppKeyValue className={cn("agent-settings-key-value", className)} {...props} />;
}

export function AgentSettingsCallout({
  className,
  ...props
}: ComponentProps<typeof ReviewCallout>) {
  return <ReviewCallout className={cn("agent-settings-callout", className)} {...props} />;
}

export function AgentSettingsToneText({
  as: Element = "p",
  tone,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "p" | "span" | "div";
  tone: "info" | AgentSettingsStatusTone;
}) {
  return (
    <Element className={cn("agent-settings-tone-text", toneTextClass(tone), className)} {...props}>
      {children}
    </Element>
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
          <span className="agent-settings-item-title">{title}</span>
          <span className="agent-settings-item-detail">{description}</span>
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
          <span className="agent-settings-item-title">{title}</span>
          <span className="agent-settings-item-detail">{description}</span>
        </span>
        <StatusBadge {...statusProps} className="agent-settings-status-badge">
          {badgeLabel}
        </StatusBadge>
      </div>
      <div className="agent-settings-grid agent-settings-grid--two" data-testid="agent-settings-api-mode-capability-items">
        {items.map((item) => (
          <AgentSurfaceBlock key={item.id} data-testid="agent-settings-api-mode-capability-item" variant="card" className="agent-settings-subitem">
            <span className="agent-settings-subitem-title">{item.label}</span>
            {item.detail ? <span className="agent-settings-subitem-detail">{item.detail}</span> : null}
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
      <span className="agent-settings-item-title">{title}</span>
      {description ? <span className="agent-settings-item-detail">{description}</span> : null}
      <div className="agent-settings-grid agent-settings-grid--two">
        {items.map((item) => (
          <AgentSurfaceBlock key={item.id} data-testid={itemTestId} variant="subtle" className="agent-settings-subitem">
            <span className="agent-settings-status-row">
              <span className="agent-settings-item-body">
                <span className="agent-settings-subitem-title">{item.label}</span>
                {item.detail ? <span className="agent-settings-subitem-detail">{item.detail}</span> : null}
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
          <span className="agent-settings-item-title">{title}</span>
          <span className="agent-settings-item-detail">{description}</span>
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
            {step.eyebrow ? <span className="agent-settings-eyebrow">{step.eyebrow}</span> : null}
            <span className="agent-settings-subitem-title">{step.label}</span>
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
          <span className="agent-settings-item-title">{title}</span>
          <span className="agent-settings-item-detail">{description}</span>
        </span>
        <Button type="button" size="sm" variant="outline" onClick={onCopy} data-testid="agent-settings-copy-api-mode-switch-taskGraph">
          {copyIcon}
          {copied ? copiedLabel : copyLabel}
        </Button>
      </div>
      <div className="agent-settings-grid agent-settings-grid--two">
        {items.map((item) => (
          <AgentSurfaceBlock key={item.id} data-testid="agent-settings-api-mode-switch-taskGraph-item" variant="subtle" className="agent-settings-subitem">
            <span className="agent-settings-status-row">
              <span className="agent-settings-item-body">
                <span className="agent-settings-subitem-title">{item.label}</span>
                {item.detail ? <span className="agent-settings-subitem-detail">{item.detail}</span> : null}
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
      <div className="agent-settings-copy-row">
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
    <AgentDataBlock className="agent-settings-readiness-row">
      <span className="agent-settings-readiness-icon">{icon}</span>
      <span className="agent-settings-item-body">
        <span className="agent-settings-item-title">{item.label}</span>
        {item.detail ? <span className="agent-settings-item-detail">{item.detail}</span> : null}
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
        <div className="agent-settings-copy-row">{copyButton}</div>
        <ReviewCallout tone="success" compact className="agent-settings-action-empty">
          {emptyLabel}
        </ReviewCallout>
        {feedback ? <AgentSettingsActionFeedback>{feedback}</AgentSettingsActionFeedback> : null}
      </div>
    );
  }

  return (
    <div data-testid="agent-settings-action-items" className="agent-settings-stack">
      {feedback ? <AgentSettingsActionFeedback>{feedback}</AgentSettingsActionFeedback> : null}
      <div className="agent-settings-action-header">
        <span data-testid="agent-settings-action-items-counts" className="agent-settings-action-count">
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
      <span className="agent-settings-status-row">
        <span className="agent-settings-item-body">
          <span className="agent-settings-item-title">{item.label}</span>
          {item.detail ? <span className="agent-settings-item-detail">{item.detail}</span> : null}
          {item.reasons && item.reasons.length > 0 ? (
            <span data-testid="agent-settings-action-item-reasons" className="agent-settings-reason-list">
              {item.reasons.map((reason, index) => (
                <AppInlineMeta key={index} className="agent-settings-reason">
                  {reason}
                </AppInlineMeta>
              ))}
            </span>
          ) : null}
          {item.persistHint ? (
            <span data-testid="agent-settings-action-persist-hint" className={cn("agent-settings-persist-hint", toneTextClass("warning"))}>
              {item.persistHint}
            </span>
          ) : null}
        </span>
        <StatusBadge {...item.statusProps} className="agent-settings-status-badge">
          {item.statusLabel}
        </StatusBadge>
      </span>
      <span className="agent-settings-action-controls">
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
    <ReviewCallout data-testid="agent-settings-action-feedback" role="status" tone="success" compact className="agent-settings-action-feedback">
      {children}
    </ReviewCallout>
  );
}

export function AgentSettingsConfigFileCard({
  name,
  idLabel,
  description,
  versionLabel,
  currentLabel,
  previewLabel,
  current = false,
  preview = false,
  summaryItems,
}: {
  name: ReactNode;
  idLabel: ReactNode;
  description?: ReactNode;
  versionLabel: ReactNode;
  currentLabel?: ReactNode;
  previewLabel?: ReactNode;
  current?: boolean;
  preview?: boolean;
  summaryItems: AgentSettingsConfigFileSummaryItem[];
}) {
  return (
    <AgentSurfaceBlock
      variant="subtle"
      data-current={current ? "true" : undefined}
      data-preview={preview ? "true" : undefined}
      className="agent-settings-config-file-card"
    >
      <div className="agent-settings-config-file-card__header">
        <div className="agent-settings-item-body">
          <div className="agent-settings-config-file-card__title-row">
            <p className="agent-settings-config-file-card__title">{name}</p>
            {current && currentLabel ? <StatusBadge intent="success" emphasis="soft">{currentLabel}</StatusBadge> : null}
            {preview && previewLabel ? <Badge>{previewLabel}</Badge> : null}
            <Badge variant="outline">{versionLabel}</Badge>
          </div>
          <p className="agent-settings-config-file-card__id">{idLabel}</p>
        </div>
      </div>
      {description ? <p className="agent-settings-config-file-card__description">{description}</p> : null}
      <div className="agent-settings-config-file-card__summary-grid">
        {summaryItems.map((item) => (
          <AgentSettingsConfigFileSummaryList key={item.id} item={item} />
        ))}
      </div>
    </AgentSurfaceBlock>
  );
}

export function AgentSettingsConfigFileEditor({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-settings-config-file-editor", className)} {...props} />;
}

export function AgentSettingsConfigFileBrowser({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <aside className={cn("agent-settings-config-file-browser", className)} {...props} />;
}

export function AgentSettingsConfigFileEditorPane({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("agent-settings-config-file-editor-pane", className)} {...props} />;
}

export function AgentSettingsConfigFileList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-settings-config-file-list", className)} {...props} />;
}

export function AgentSettingsConfigFileListButton({
  name,
  idLabel,
  description,
  versionLabel,
  currentLabel,
  selectedLabel,
  current = false,
  selected = false,
  summaryLabel,
  onSelect,
}: {
  name: ReactNode;
  idLabel: ReactNode;
  description?: ReactNode;
  versionLabel: ReactNode;
  currentLabel?: ReactNode;
  selectedLabel?: ReactNode;
  current?: boolean;
  selected?: boolean;
  summaryLabel?: ReactNode;
  onSelect: () => void;
}) {
  return (
    <AgentSurfaceBlock
      asChild
      variant="subtle"
      data-current={current ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      className="agent-settings-config-file-list-item"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={selected}
        onClick={onSelect}
        className="agent-settings-config-file-list-item__button"
      >
        <span className="agent-settings-config-file-list-item__header">
          <span className="agent-settings-config-file-list-item__title">{name}</span>
          <span className="agent-settings-config-file-list-item__badges">
            {current && currentLabel ? <StatusBadge intent="success" emphasis="soft">{currentLabel}</StatusBadge> : null}
            {selected && selectedLabel ? <Badge variant="soft">{selectedLabel}</Badge> : null}
            <Badge variant="outline">{versionLabel}</Badge>
          </span>
        </span>
        <span className="agent-settings-config-file-list-item__id">{idLabel}</span>
        {description ? <span className="agent-settings-config-file-list-item__description">{description}</span> : null}
        {summaryLabel ? <span className="agent-settings-config-file-list-item__summary">{summaryLabel}</span> : null}
      </Button>
    </AgentSurfaceBlock>
  );
}

export function AgentSettingsConfigFileEditorHeader({
  title,
  description,
  badges,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="agent-settings-config-file-editor-header">
      <div className="agent-settings-item-body">
        <div className="agent-settings-config-file-editor-header__title-row">
          <h2 className="agent-settings-config-file-editor-header__title">{title}</h2>
          {badges ? <span className="agent-settings-config-file-editor-header__badges">{badges}</span> : null}
        </div>
        {description ? <p className="agent-settings-config-file-editor-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="agent-settings-config-file-editor-header__actions">{actions}</div> : null}
    </div>
  );
}

export function AgentSettingsConfigFileEditorSection({
  title,
  description,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <AgentSurfaceBlock asChild variant="card" className={cn("agent-settings-config-file-editor-section", className)}>
      <section {...props}>
        <div className="agent-settings-config-file-editor-section__header">
          <p className="agent-settings-config-file-editor-section__title">{title}</p>
          {description ? <p className="agent-settings-config-file-editor-section__description">{description}</p> : null}
        </div>
        <div className="agent-settings-config-file-editor-section__body">{children}</div>
      </section>
    </AgentSurfaceBlock>
  );
}

export function AgentSettingsConfigFileSummaryList({ item }: { item: AgentSettingsConfigFileSummaryItem }) {
  return (
    <AgentSurfaceBlock variant="card" className="agent-settings-config-file-summary">
      <p className="agent-settings-config-file-summary__label">{item.label}</p>
      <p className="agent-settings-config-file-summary__value">{item.value}</p>
    </AgentSurfaceBlock>
  );
}

export function AgentSettingsConfigFileDiffPanel({
  title,
  sections,
}: {
  title: ReactNode;
  sections: AgentSettingsConfigFileDiffSection[];
}) {
  return (
    <AgentDataBlock>
      <p className="agent-settings-item-title">{title}</p>
      <div className="agent-settings-grid agent-settings-grid--two">
        {sections.map((section) => (
          <AgentSettingsConfigFileDiffSectionView key={section.id} section={section} />
        ))}
      </div>
    </AgentDataBlock>
  );
}

export function AgentSettingsConfigFileDiffSectionView({ section }: { section: AgentSettingsConfigFileDiffSection }) {
  return (
    <AgentSurfaceBlock variant="card" className="agent-settings-config-file-diff-section">
      <p className="agent-settings-config-file-diff-section__label">{section.label}</p>
      {section.lines.length > 0 ? (
        <div className="agent-settings-config-file-diff-section__lines">
          {section.lines.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
      ) : (
        <p className="agent-settings-config-file-diff-section__empty">{section.emptyLabel}</p>
      )}
    </AgentSurfaceBlock>
  );
}

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
      <div className="agent-settings-skill-card__header">
        <div className="agent-settings-item-body">
          <div className="agent-settings-skill-card__title-row">
            <p className="agent-settings-skill-card__title">{name}</p>
            <StatusBadge {...agentSettingsBooleanStatusRecipe(enabled)}>{enabled ? enabledLabel : disabledLabel}</StatusBadge>
            {loadModeLabel ? <Badge variant="outline">{loadModeLabel}</Badge> : null}
            {versionLabel ? <Badge variant="outline">{versionLabel}</Badge> : null}
            <Badge variant="outline">{sourceLabel}</Badge>
          </div>
          <p className="agent-settings-skill-card__id">{idLabel}</p>
        </div>
        {priorityLabel ? <span className="agent-settings-skill-card__priority">{priorityLabel}</span> : null}
      </div>
      {!compact && description ? <p className="agent-settings-skill-card__description">{description}</p> : null}
      {!compact && typeof workspaceEnabled === "boolean" && onWorkspaceChange ? (
        <AgentSurfaceBlock variant="card" className="agent-settings-skill-card__workspace">
          <CheckboxField
            checked={workspaceEnabled}
            disabled={workspaceDisabled}
            onCheckedChange={onWorkspaceChange}
            controlSize="sm"
            className={cn("agent-settings-skill-card__toggle", workspaceLocked ? "agent-settings-skill-card__toggle--locked" : undefined)}
          >
            <span className="agent-settings-skill-card__workspace-copy">
              {workspaceTitle ? <span className="agent-settings-skill-card__workspace-title">{workspaceTitle}</span> : null}
              {workspaceHelp ? <span className="agent-settings-skill-card__workspace-help">{workspaceHelp}</span> : null}
            </span>
          </CheckboxField>
        </AgentSurfaceBlock>
      ) : null}
      {!compact && instructionValue !== undefined && onInstructionChange ? (
        <label className="agent-settings-skill-card__instruction">
          {instructionLabel ? <span className="agent-settings-skill-card__workspace-title">{instructionLabel}</span> : null}
          {instructionHelp ? <span className="agent-settings-skill-card__workspace-help">{instructionHelp}</span> : null}
          <Textarea
            value={instructionValue}
            disabled={instructionDisabled}
            onChange={(event) => onInstructionChange(event.target.value)}
            data-testid="agent-settings-skill-instruction-editor"
          />
        </label>
      ) : null}
      {!compact && metaItems && metaItems.length > 0 ? (
        <div className="agent-settings-skill-card__meta">
          {metaItems.map((item) => (
            <AppInlineMeta key={item.id}>{item.label}</AppInlineMeta>
          ))}
        </div>
      ) : null}
    </AgentDataBlock>
  );
}

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
      <div className="agent-settings-tool-permissions-diff__header">
        <span className="agent-settings-item-body">
          <span className="agent-settings-item-title">{title}</span>
          <span className="agent-settings-item-detail">{summary}</span>
        </span>
        <Button type="button" size="sm" variant="outline" onClick={onCopy} data-testid="agent-settings-copy-tool-permissions-diff">
          {copyIcon}
          {copied ? copiedLabel : copyLabel}
        </Button>
      </div>
      <div className="agent-settings-tool-permissions-diff__list">
        {items.slice(0, 8).map((item) => (
          <AgentSurfaceBlock key={item.id} data-testid="agent-settings-tool-permissions-diff-item" variant="subtle" className="agent-settings-tool-permissions-diff__item">
            <span className="agent-settings-item-body">
              <span className="agent-settings-tool-permissions-diff__name">{item.name}</span>
              <span className="agent-settings-tool-permissions-diff__value">
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
      <div className="agent-settings-tool-permissions-row__header">
        <div className="agent-settings-item-body">
          <div className="agent-settings-tool-permissions-row__title-row">
            <p className="agent-settings-tool-permissions-row__title">{name}</p>
            <StatusBadge {...agentSettingsAvailabilityStatusRecipe(available)}>{available ? availableLabel : blockedLabel}</StatusBadge>
            {configFileGranted && configFileGrantedLabel ? <Badge>{configFileGrantedLabel}</Badge> : null}
          </div>
          <p className="agent-settings-tool-permissions-row__meta-line">
            {sourceLabel} / {permissionLabel} / {riskLabel}
          </p>
        </div>
        <StatusBadge {...agentSettingsApprovalStatusRecipe(Boolean(requiresApproval))}>{approvalStatusLabel}</StatusBadge>
      </div>
      {!compact && description ? <p className="agent-settings-tool-permissions-row__description">{description}</p> : null}
      {!compact && workspace ? (
        <div className="agent-settings-tool-permissions-row__controls">
          <div>
            <label className="agent-settings-tool-permissions-row__field-label">{modeLabel}</label>
            <Select value={workspace.mode} onValueChange={(value) => onModeChange?.(value as AgentSettingsToolPermissionsMode)}>
              <SelectTrigger className="agent-settings-tool-permissions-row__select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allow" disabled={!workspace.canAllow}>{allowLabel}</SelectItem>
                <SelectItem value="deny">{denyLabel}</SelectItem>
              </SelectContent>
            </Select>
            {!workspace.canAllow && allowDisabledHelp ? (
              <p className="agent-settings-tool-permissions-row__help">{allowDisabledHelp}</p>
            ) : null}
          </div>
          <div>
            <label className="agent-settings-tool-permissions-row__field-label">{approvalLabel}</label>
            <Select value={workspace.approval} onValueChange={(value) => onApprovalChange?.(value as AgentSettingsToolPermissionsApproval)}>
              <SelectTrigger className="agent-settings-tool-permissions-row__select">
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
        <div className="agent-settings-tool-permissions-row__meta">
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
        className="agent-settings-tool-permissions-filter__search"
        data-testid="agent-settings-tool-permissions-search"
      />
      <Select value={filterValue} onValueChange={onFilterChange}>
        <SelectTrigger className="agent-settings-tool-permissions-filter__select" data-testid="agent-settings-tool-permissions-filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {filterOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="agent-settings-tool-permissions-filter__summary" data-testid="agent-settings-tool-permissions-filter-summary">
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
      <div className="agent-settings-tool-permissions-presets__header">
        <span className="agent-settings-tool-permissions-presets__title">{title}</span>
        <Button type="button" size="sm" variant="outline" onClick={onSave}>
          {saveIcon}
          {saveLabel}
        </Button>
        <span className="agent-settings-tool-permissions-presets__help">{help}</span>
      </div>
      {presets.length > 0 ? (
        <div className="agent-settings-tool-permissions-presets__list">
          {presets.map((preset) => (
            <AgentSurfaceBlock key={preset.id} variant="subtle" className="agent-settings-tool-permissions-presets__item">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="agent-settings-tool-permissions-presets__select"
                title={preset.title}
                onClick={preset.onSelect}
              >
                <span className="agent-settings-tool-permissions-presets__select-label">{preset.name}</span>
              </Button>
              <Button type="button" size="icon" variant="ghost" aria-label={deleteLabel} onClick={preset.onDelete}>
                {deleteIcon ?? <XIcon size={14} />}
              </Button>
            </AgentSurfaceBlock>
          ))}
        </div>
      ) : (
        <p className="agent-settings-tool-permissions-presets__empty">{emptyLabel}</p>
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
    <AgentSurfaceBlock data-testid="agent-settings-tool-permissions-bulk-actions" className="agent-settings-tool-permissions-bulk">
      <span className="agent-settings-tool-permissions-bulk__title">{title}</span>
      {actions.map((action) => (
        <Button key={action.id} type="button" size="sm" variant="outline" onClick={action.onClick} disabled={action.disabled}>
          {action.label}
        </Button>
      ))}
      <span className="agent-settings-tool-permissions-bulk__help">{help}</span>
    </AgentSurfaceBlock>
  );
}

export function AgentSettingsPackPanel({
  title,
  description,
  fileInputRef,
  onFileChange,
  loadFileLabel,
  onLoadFile,
  installLabel,
  installIcon,
  installDisabled,
  onInstall,
  fileLoadedLabel,
  textValue,
  onTextChange,
  placeholder,
  workspaceSummary,
  workspaceError,
  installError,
  installResult,
  installedTitle,
  installedPlugins,
  uninstallLabel,
  uninstallValue,
  onUninstallValueChange,
  uninstallPlaceholder,
  uninstallActionLabel,
  uninstallIcon,
  uninstallDisabled,
  onUninstall,
  uninstallHelp,
  uninstallInputError,
  uninstallError,
  uninstallResult,
}: {
  title: ReactNode;
  description: ReactNode;
  fileInputRef?: Ref<HTMLInputElement>;
  onFileChange: (file?: File | null) => void;
  loadFileLabel: ReactNode;
  onLoadFile: () => void;
  installLabel: ReactNode;
  installIcon?: ReactNode;
  installDisabled?: boolean;
  onInstall: () => void;
  fileLoadedLabel?: ReactNode;
  textValue: string;
  onTextChange: (value: string) => void;
  placeholder?: string;
  workspaceSummary?: ReactNode;
  workspaceError?: ReactNode;
  installError?: ReactNode;
  installResult?: ReactNode;
  installedTitle: ReactNode;
  installedPlugins: AgentSettingsPackPluginItem[];
  uninstallLabel: ReactNode;
  uninstallValue: string;
  onUninstallValueChange: (value: string) => void;
  uninstallPlaceholder?: string;
  uninstallActionLabel: ReactNode;
  uninstallIcon?: ReactNode;
  uninstallDisabled?: boolean;
  onUninstall: () => void;
  uninstallHelp: ReactNode;
  uninstallInputError?: ReactNode;
  uninstallError?: ReactNode;
  uninstallResult?: ReactNode;
}) {
  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    onFileChange(event.target.files?.[0]);
  }

  return (
    <AgentDataBlock className="agent-settings-pack">
      <div className="agent-settings-pack__header">
        <div className="agent-settings-item-body">
          <p className="agent-settings-item-title">{title}</p>
          <p className="agent-settings-item-detail">{description}</p>
        </div>
        <div className="agent-settings-pack__actions">
          <Input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="agent-settings-pack__file-input"
            onChange={handleFileChange}
          />
          <Button type="button" size="sm" variant="outline" onClick={onLoadFile}>
            {loadFileLabel}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onInstall} disabled={installDisabled}>
            {installIcon}
            {installLabel}
          </Button>
        </div>
      </div>
      {fileLoadedLabel ? <p className="agent-settings-pack__message">{fileLoadedLabel}</p> : null}
      <Textarea
        value={textValue}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder={placeholder}
        className="agent-settings-pack__textarea"
      />
      {workspaceSummary ? (
        <p data-testid="agent-settings-pack-workspace-summary" className="agent-settings-pack__message">
          {workspaceSummary}
        </p>
      ) : null}
      {!installError && workspaceError ? (
        <div className="agent-settings-pack__feedback" data-testid="agent-settings-pack-workspace-error">
          <AppInlineError>{workspaceError}</AppInlineError>
        </div>
      ) : null}
      {installError ? (
        <div className="agent-settings-pack__feedback">
          <AppInlineError>{installError}</AppInlineError>
        </div>
      ) : null}
      {installResult ? <p className="agent-settings-pack__message">{installResult}</p> : null}
      <div className="agent-settings-pack__uninstall">
        {installedPlugins.length > 0 ? (
          <div className="agent-settings-pack__installed">
            <p className="agent-settings-pack__installed-title">{installedTitle}</p>
            <div className="agent-settings-pack__installed-list">
              {installedPlugins.map((plugin) => (
                <AgentSurfaceBlock key={plugin.id} variant="card" className="agent-settings-pack__installed-item">
                  <div className="agent-settings-item-body">
                    <p className="agent-settings-pack__plugin-id">{plugin.id}</p>
                    <p className="agent-settings-pack__plugin-path">{plugin.path}</p>
                  </div>
                  <Button
                    type="button"
                    size="xs"
                    variant={plugin.actionVariant ?? "ghost"}
                    intent={plugin.actionIntent ?? "neutral"}
                    onClick={plugin.onAction}
                    disabled={plugin.disabled}
                    data-testid="agent-settings-installed-pack-uninstall"
                  >
                    {plugin.actionIcon}
                    {plugin.actionLabel}
                  </Button>
                </AgentSurfaceBlock>
              ))}
            </div>
          </div>
        ) : null}
        <div className="agent-settings-pack__uninstall-row">
          <label className="agent-settings-pack__uninstall-field">
            <span className="agent-settings-pack__field-label">{uninstallLabel}</span>
            <Input
              value={uninstallValue}
              onChange={(event) => onUninstallValueChange(event.target.value)}
              placeholder={uninstallPlaceholder}
              className="agent-settings-pack__uninstall-input"
            />
          </label>
          <Button type="button" size="sm" variant="outline" onClick={onUninstall} disabled={uninstallDisabled}>
            {uninstallIcon}
            {uninstallActionLabel}
          </Button>
        </div>
        <p className="agent-settings-pack__help">{uninstallHelp}</p>
        {uninstallInputError ? (
          <div className="agent-settings-pack__feedback" data-testid="agent-settings-uninstall-plugin-id-error">
            <AppInlineError>{uninstallInputError}</AppInlineError>
          </div>
        ) : null}
        {uninstallError ? (
          <div className="agent-settings-pack__feedback">
            <AppInlineError>{uninstallError}</AppInlineError>
          </div>
        ) : null}
        {uninstallResult ? <p className="agent-settings-pack__message">{uninstallResult}</p> : null}
      </div>
    </AgentDataBlock>
  );
}

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
      <span className="agent-settings-item-title">{title}</span>
      <span className="agent-settings-item-detail">{description}</span>
      <div data-testid="agent-settings-snapshot-import-presets" className="agent-settings-snapshot-import__presets">
        <span className="agent-settings-snapshot-import__presets-label">{presetsLabel}</span>
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
      <p className="agent-settings-snapshot-import__help">{presetsHelp}</p>
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
                <span className="agent-settings-snapshot-import__scope-title">{scope.label}</span>
                <span className="agent-settings-snapshot-import__scope-detail">{scope.detail}</span>
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
      <p className="agent-settings-item-title">{title}</p>
      <div className="agent-settings-snapshot-summary__grid">
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
        <AgentDataBlock className="agent-settings-audit-trail__empty">
          {emptyLabel}
        </AgentDataBlock>
      </div>
    );
  }
  return (
    <div data-testid="agent-settings-audit-trail" className="agent-settings-audit-trail">
      <div className="agent-settings-audit-trail__header">
        <span className="agent-settings-audit-trail__help">{help}</span>
        <span className="agent-settings-audit-trail__actions">
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
            <div className="agent-settings-audit-trail__entry-content">
              <span className="agent-settings-item-body">
                <span className="agent-settings-audit-trail__summary">{entry.summary}</span>
                <span className="agent-settings-audit-trail__time">{entry.createdAtLabel}</span>
              </span>
              <span className="agent-settings-audit-trail__badges">
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
      <div className="agent-settings-snapshot-impact__header">
        <p className="agent-settings-item-title">{title}</p>
        <Button type="button" size="sm" variant="outline" onClick={onCopy} data-testid="agent-settings-copy-snapshot-impact">
          {copyIcon}
          {copied ? copiedLabel : copyLabel}
        </Button>
      </div>
      <div className="agent-settings-snapshot-impact__list">
        {items.map((item) => (
          <AgentSurfaceBlock key={item.id} data-testid="agent-settings-snapshot-impact-item" variant="subtle" className="agent-settings-snapshot-impact__item">
            <span className="agent-settings-item-body">
              <span className="agent-settings-snapshot-impact__item-title">{item.label}</span>
              <span className="agent-settings-snapshot-impact__item-detail">{item.detail}</span>
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

export const AgentSettingsItemBody = ({
  title,
  detail,
  className,
}: {
  title: ReactNode;
  detail?: ReactNode;
  className?: string;
}) => {
  return (
    <span className={cn("agent-settings-item-body", className)}>
      <span className="agent-settings-item-title">{title}</span>
      {detail ? <span className="agent-settings-item-detail">{detail}</span> : null}
    </span>
  );
};
