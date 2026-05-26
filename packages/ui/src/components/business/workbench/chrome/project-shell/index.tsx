import type { ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { ArrowRightIcon, Button, RefreshIcon } from "../../../../primitives";
import type { WorkbenchIconComponent } from "../../types";

export interface WorkbenchProjectAction {
  label: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export interface WorkbenchProjectHeaderProps {
  icon: WorkbenchIconComponent;
  kicker?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  badges?: ReactNode;
  headerBody?: ReactNode;
  actions?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshLabel?: ReactNode;
  primaryAction?: WorkbenchProjectAction;
}

export function WorkbenchProjectHeader({
  icon: Icon,
  kicker,
  title,
  description,
  badges,
  headerBody,
  actions,
  onRefresh,
  refreshing = false,
  refreshLabel = "刷新上下文",
  primaryAction,
}: WorkbenchProjectHeaderProps) {
  return (
    <header data-testid="project-workbench-header" className="workbench-project-header">
      <div className="workbench-project-header__main">
        <div className="workbench-project-header__identity">
          <span className="workbench-project-header__icon">
            <Icon size={18} />
          </span>
          <div className="workbench-project-header__copy">
            {kicker ? <p className="workbench-project-header__kicker">{kicker}</p> : null}
            <h1 className="workbench-project-header__title">{title}</h1>
            {description ? <p className="workbench-project-header__description">{description}</p> : null}
            {badges ? <div className="workbench-project-header__badges">{badges}</div> : null}
          </div>
        </div>
        <div className="workbench-project-header__actions">
          {onRefresh ? (
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshIcon className={refreshing ? "workbench-project-header__refresh-icon is-spinning" : "workbench-project-header__refresh-icon"} />
              {refreshLabel}
            </Button>
          ) : null}
          {actions}
          {primaryAction ? (
            <Button size="sm" disabled={primaryAction.disabled} loading={primaryAction.loading} onClick={primaryAction.onClick}>
              <ArrowRightIcon className="workbench-project-header__action-icon" />
              {primaryAction.label}
            </Button>
          ) : null}
        </div>
      </div>
      {headerBody ? <div className="workbench-project-header__body">{headerBody}</div> : null}
    </header>
  );
}

export function WorkbenchProjectShell({
  children,
  className,
  workbenchId,
  ...headerProps
}: WorkbenchProjectHeaderProps & {
  children: ReactNode;
  className?: string;
  workbenchId?: string;
}) {
  return (
    <div data-testid="project-workbench-shell" data-workbench-id={workbenchId} className={cn("workbench-project-shell", className)}>
      <WorkbenchProjectHeader {...headerProps} />
      {children}
    </div>
  );
}
