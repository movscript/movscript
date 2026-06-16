import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/shared/ui/cn";
import {
  AppCreateDialog,
  AppEmptyState,
  AppMetricCard,
  AppPanel,
  AppProgressBar,
  AppStateMessage,
  AppSurfaceItem,
} from "@movscript/ui/business/app";
import { Button } from "@movscript/ui/primitives";
import type { IconComponent } from "@movscript/ui/primitives";
import type { UiSemanticIntent } from "@movscript/ui/style-system";

export function ScriptMetricBox({
  icon,
  label,
  value,
}: {
  icon: IconComponent;
  label: ReactNode;
  value: ReactNode;
}) {
  return <AppMetricCard icon={icon} label={label} value={value} compact />;
}

type ScriptDetailHeaderAttributes = Omit<HTMLAttributes<HTMLElement>, "title">;

export interface ScriptDetailHeaderProps extends ScriptDetailHeaderAttributes {
  badges?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  metrics?: ReactNode;
}

export function ScriptDetailHeader({
  badges,
  title,
  description,
  actions,
  metrics,
  className,
  ...props
}: ScriptDetailHeaderProps) {
  return (
    <header className={cn("script-detail-header", className)} {...props}>
      <div className="script-detail-header__top">
        <div className="script-detail-header__copy">
          {badges ? <div className="script-detail-header__badges">{badges}</div> : null}
          <h2 className="script-detail-header__title">{title}</h2>
          {description ? <p className="script-detail-header__description">{description}</p> : null}
        </div>
        {actions ? <div className="script-detail-header__actions">{actions}</div> : null}
      </div>
      {metrics ? <div className="script-detail-header__metrics">{metrics}</div> : null}
    </header>
  );
}

type ScriptDetailTabsAttributes = Omit<HTMLAttributes<HTMLDivElement>, "onSelect">;

export interface ScriptDetailTabItem {
  key: string;
  label: ReactNode;
}

export interface ScriptDetailTabsProps extends ScriptDetailTabsAttributes {
  tabs: ScriptDetailTabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
}

export function ScriptDetailTabs({
  tabs,
  activeKey,
  onSelect,
  className,
  ...props
}: ScriptDetailTabsProps) {
  return (
    <div className={cn("script-detail-tabs", className)} {...props}>
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <Button
            key={tab.key}
            type="button"
            variant="ghost"
            data-active={active ? "true" : undefined}
            onClick={() => onSelect(tab.key)}
            className="script-detail-tabs__trigger"
          >
            {tab.label}
          </Button>
        );
      })}
    </div>
  );
}

type ScriptVersionCardAttributes = Omit<HTMLAttributes<HTMLDivElement>, "title">;

export interface ScriptVersionCardProps extends ScriptVersionCardAttributes {
  versionLabel: ReactNode;
  status?: ReactNode;
  title: ReactNode;
  meta: ReactNode;
  toggleLabel?: ReactNode;
  onToggle?: () => void;
}

export function ScriptVersionCard({
  versionLabel,
  status,
  title,
  meta,
  toggleLabel,
  onToggle,
  children,
  className,
  ...props
}: ScriptVersionCardProps) {
  return (
    <div className={cn("script-version-card", className)} {...props}>
      <div className="script-version-card__header">
        <div className="script-version-card__copy">
          <div className="script-version-card__title-row">
            <span className="script-version-card__version">{versionLabel}</span>
            {status}
            <span className="script-version-card__title">{title}</span>
          </div>
          <p className="script-version-card__meta">{meta}</p>
        </div>
        {onToggle && toggleLabel ? (
          <div className="script-version-card__actions">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onToggle}
              className="script-version-card__toggle"
            >
              {toggleLabel}
            </Button>
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export interface ScriptCreateDialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}

export function ScriptCreateDialog({ open, onClose, title, children }: ScriptCreateDialogProps) {
  return (
    <AppCreateDialog open={open} onClose={onClose} title={title}>
      {children}
    </AppCreateDialog>
  );
}

export interface ScriptVersionHistoryPanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function ScriptVersionHistoryPanel({
  title,
  description,
  action,
  children,
  className,
  ...props
}: ScriptVersionHistoryPanelProps) {
  return (
    <div className={cn("script-version-history-panel", className)} {...props}>
      <div className="script-version-history-panel__header">
        <div className="script-version-history-panel__copy">
          <h3 className="script-version-history-panel__title">{title}</h3>
          {description ? <p className="script-version-history-panel__description">{description}</p> : null}
        </div>
        {action ? <div className="script-version-history-panel__action">{action}</div> : null}
      </div>
      {children}
    </div>
  );
}

export interface ScriptVersionEmptyStateProps {
  icon?: IconComponent;
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
}

export function ScriptVersionEmptyState({ icon, title, detail, action }: ScriptVersionEmptyStateProps) {
  return <AppEmptyState icon={icon} title={title} detail={detail} action={action} />;
}

export interface ScriptProductionPanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
}

export function ScriptProductionPanel({
  title,
  description,
  children,
  className,
  ...props
}: ScriptProductionPanelProps) {
  return (
    <div className={cn("script-production-panel", className)} {...props}>
      <div className="script-production-panel__header">
        <h3 className="script-production-panel__title">{title}</h3>
        {description ? <p className="script-production-panel__description">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

export interface ScriptProductionNoticeProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
}

export function ScriptProductionNotice({ title, children, className, ...props }: ScriptProductionNoticeProps) {
  return (
    <AppStateMessage tone="neutral" className={cn("script-production-notice", className)} {...props}>
      <p className="script-production-notice__title">{title}</p>
      {children ? <div className="script-production-notice__body">{children}</div> : null}
    </AppStateMessage>
  );
}

export function ScriptCollaborationEmpty({ icon, title }: { icon?: IconComponent; title: ReactNode }) {
  return <AppEmptyState icon={icon} title={title} compact />;
}

export function ScriptCollaborationStack({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("script-collaboration-stack", className)} {...props}>
      {children}
    </div>
  );
}

export interface ScriptAgentAssistPanelProps {
  icon?: IconComponent;
  title: ReactNode;
  description: ReactNode;
  primaryAction: ReactNode;
  secondaryActions?: ReactNode;
}

export function ScriptAgentAssistPanel({
  icon,
  title,
  description,
  primaryAction,
  secondaryActions,
}: ScriptAgentAssistPanelProps) {
  return (
    <AppPanel icon={icon} title={title} bodyClassName="script-agent-assist-panel__body" className="bg-background">
      <p className="script-agent-assist-panel__description">{description}</p>
      <div className="script-agent-assist-panel__actions">
        {primaryAction}
        {secondaryActions ? <div className="script-agent-assist-panel__secondary">{secondaryActions}</div> : null}
      </div>
    </AppPanel>
  );
}

export interface ScriptReadinessPanelProps {
  title: ReactNode;
  value: number;
  status: ReactNode;
  tone?: "brand" | UiSemanticIntent;
  rows: ReactNode;
  actions?: ReactNode;
}

export function ScriptReadinessPanel({ title, value, status, tone = "brand", rows, actions }: ScriptReadinessPanelProps) {
  return (
    <AppPanel title={title} action={status} className="bg-background">
      <AppProgressBar value={value} tone={tone} />
      <div className="script-readiness-panel__rows">{rows}</div>
      {actions ? <div className="script-readiness-panel__actions">{actions}</div> : null}
    </AppPanel>
  );
}

export function ScriptWorkflowPanel({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <AppPanel title={title} className="bg-background">
      <div className="script-workflow-panel__steps">{children}</div>
    </AppPanel>
  );
}

export function ScriptWorkflowStep({
  index,
  title,
  active,
}: {
  index: ReactNode;
  title: ReactNode;
  active?: boolean;
}) {
  return (
    <AppSurfaceItem
      variant="muted"
      className={cn("script-workflow-step", active && "script-workflow-step--active")}
    >
      <span className="script-workflow-step__index">{index}</span>
      <span className="script-workflow-step__title">{title}</span>
    </AppSurfaceItem>
  );
}

export function ScriptReadinessRow({
  label,
  done,
  status,
}: {
  label: ReactNode;
  done: boolean;
  status: ReactNode;
}) {
  return (
    <AppStateMessage className="script-readiness-row">
      <span className="script-readiness-row__label">{label}</span>
      <span className="script-readiness-row__status" data-ready={done ? "true" : "false"}>
        {status}
      </span>
    </AppStateMessage>
  );
}
