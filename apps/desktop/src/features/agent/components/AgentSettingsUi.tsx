import type { ComponentProps, HTMLAttributes, ReactNode } from "react";

import {
  Badge,
  Button,
  Input,
  SelectTrigger,
  StatusBadge,
  Textarea,
} from "@movscript/ui/primitives";
import type { IconComponent } from "@movscript/ui/primitives";
import { cn } from "@/shared/ui/cn";
import { toneTextClass } from "@movscript/ui/semantic";
import { AppCodeBlock, AppInlineMeta, AppKeyValue, AppPanel, AppStateMessage } from "@movscript/ui/business/app";
import { ReviewCallout } from "@movscript/ui/business/review";
import "./AgentSettingsUi.css";

export type {
  AgentSettingsActionItem,
  AgentSettingsAuditTrailItem,
  AgentSettingsLabeledItem,
  AgentSettingsSkillMetaItem,
  AgentSettingsSnapshotImpactItem,
  AgentSettingsSnapshotPresetItem,
  AgentSettingsSnapshotScopeItem,
  AgentSettingsSnapshotSummaryItem,
  AgentSettingsStatusItem,
  AgentSettingsStatusProps,
  AgentSettingsStatusTone,
  AgentSettingsToolPermissionsApproval,
  AgentSettingsToolPermissionsBulkActionItem,
  AgentSettingsToolPermissionsDiffItem,
  AgentSettingsToolPermissionsFilterOption,
  AgentSettingsToolPermissionsFilterPresetItem,
  AgentSettingsToolPermissionsMetaItem,
  AgentSettingsToolPermissionsMode,
} from "./AgentSettingsUi.types";

import type { AgentSettingsStatusTone } from "./AgentSettingsUi.types";
export { AgentSettingsSkillCard } from "./AgentSettingsSkillUi";
export {
  AgentSettingsAuditTrailPanel,
  AgentSettingsSnapshotImpactPanel,
  AgentSettingsSnapshotImportScopePanel,
  AgentSettingsSnapshotSummaryPanel,
} from "./AgentSettingsSnapshotUi";
export {
  AgentSettingsActionFeedback,
  AgentSettingsActionItemRow,
  AgentSettingsActionItemsPanel,
  AgentSettingsApiModeCapabilityMatrix,
  AgentSettingsMigrationGuide,
  AgentSettingsModelRouteCard,
  AgentSettingsReadinessPanel,
  AgentSettingsReadinessRow,
  AgentSettingsStatusPanel,
  AgentSettingsSwitchPlanPanel,
  AgentSettingsToggleRow,
} from "./AgentSettingsStatusUi";
export {
  AgentSettingsToolPermissionsBulkActionPanel,
  AgentSettingsToolPermissionsDiffPanel,
  AgentSettingsToolPermissionsFilterPanel,
  AgentSettingsToolPermissionsFilterPresetPanel,
  AgentSettingsToolPermissionsRow,
} from "./AgentSettingsToolPermissionsUi";

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
  return <div className={cn("ms-action-row agent-settings-header", className)} {...props} />;
}

export function AgentSettingsHeaderCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-settings-header__copy", className)} {...props} />;
}

export function AgentSettingsHeaderTitleRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ms-action-row agent-settings-header__title-row", className)} {...props} />;
}

export function AgentSettingsHeaderTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn("ms-type-title agent-settings-header__title", className)} {...props} />;
}

export function AgentSettingsHeaderDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("ms-type-label agent-settings-header__description", className)} {...props} />;
}

export function AgentSettingsHeaderActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ms-action-row agent-settings-header__actions", className)} {...props} />;
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
  return <Input className={cn("ms-type-label agent-settings-input", className)} {...props} />;
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
      className={cn("ms-type-label agent-settings-textarea", className)}
      {...props}
    />
  );
}

export function AgentSettingsSelectTrigger({ className, ...props }: ComponentProps<typeof SelectTrigger>) {
  return <SelectTrigger className={cn("ms-type-label agent-settings-select-trigger", className)} {...props} />;
}

export function AgentSettingsCodeBlock({ className, ...props }: ComponentProps<typeof AppCodeBlock>) {
  return <AppCodeBlock className={cn("ms-type-label agent-settings-code", className)} {...props} />;
}

export function AgentSettingsLayout({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-settings-layout", className)} {...props} />;
}

export function AgentSettingsMain({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("agent-settings-main", className)} {...props} />;
}

export function AgentSettingsStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ms-stack agent-settings-stack", className)} {...props} />;
}

export function AgentSettingsActionRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ms-action-row agent-settings-action-row", className)} {...props} />;
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
  return <label className={cn("ms-type-label agent-settings-field-label", className)} {...props} />;
}

export function AgentSettingsFieldHelp({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("ms-type-caption agent-settings-field-help", className)} {...props} />;
}

export function AgentSettingsInlineNote({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("ms-type-caption agent-settings-inline-note", className)} {...props} />;
}

export function AgentSettingsItemTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("ms-type-label agent-settings-item-title", className)} {...props} />;
}

export function AgentSettingsItemDetail({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("ms-type-caption agent-settings-item-detail", className)} {...props} />;
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

export function AgentSettingsScopeRail({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ms-action-row agent-settings-scope-rail", className)} {...props}>
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

export {
  agentSettingsApiModeBadgeRecipe,
  agentSettingsApprovalStatusRecipe,
  agentSettingsAvailabilityStatusRecipe,
  agentSettingsBooleanStatusRecipe,
  agentSettingsRecipe,
  agentSettingsStatusRecipe,
} from "./AgentSettingsUi.recipes";

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
    <span className={cn("ms-stack agent-settings-item-body", className)}>
      <span className="ms-type-label agent-settings-item-title">{title}</span>
      {detail ? <span className="ms-type-caption agent-settings-item-detail">{detail}</span> : null}
    </span>
  );
};
