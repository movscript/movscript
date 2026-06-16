import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import {
  ArrowRightIcon,
  Button,
  FrameActions,
  FrameBody,
  FrameDescription,
  FrameHeader,
  FrameHeading,
  FrameTitle,
  RefreshIcon,
} from "../../../../primitives";
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
    <FrameHeader as="header" data-testid="project-workbench-header" className="workbench-project-header">
      <div className="ms-action-row workbench-project-header__main">
        <FrameHeading className="workbench-project-header__identity">
          <span className="ms-inline-center workbench-project-header__icon">
            <Icon size={18} />
          </span>
          <div className="ms-workbench-copy workbench-project-header__copy">
            {kicker ? <p className="ms-text-truncate ms-type-caption workbench-project-header__kicker">{kicker}</p> : null}
            <FrameTitle as="h1" className="ms-text-truncate ms-type-section workbench-project-header__title">{title}</FrameTitle>
            {description ? <FrameDescription className="ms-text-truncate ms-type-label workbench-project-header__description">{description}</FrameDescription> : null}
            {badges ? <div className="ms-action-row workbench-project-header__badges">{badges}</div> : null}
          </div>
        </FrameHeading>
        <FrameActions className="workbench-project-header__actions">
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
        </FrameActions>
      </div>
      {headerBody ? <FrameBody className="workbench-project-header__body">{headerBody}</FrameBody> : null}
    </FrameHeader>
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
    <div data-testid="project-workbench-shell" data-workbench-id={workbenchId} className={cn("ms-stack workbench-project-shell", className)}>
      <WorkbenchProjectHeader {...headerProps} />
      {children}
    </div>
  );
}

export function WorkbenchProjectBody({
  className,
  layout,
  padding = "normal",
  scroll = "auto",
  tone = "plain",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  layout?: "document" | "workspace";
  padding?: "normal" | "none";
  scroll?: "auto" | "hidden" | "responsive";
  tone?: "plain" | "muted";
}) {
  return (
    <div
      className={cn("ms-workbench-copy workbench-project-body", layout === "workspace" && "ms-stack", className)}
      data-layout={layout}
      data-padding={padding}
      data-scroll={scroll}
      data-tone={tone}
      {...props}
    />
  );
}

export function WorkbenchProjectViewport({
  className,
  direction = "row",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  direction?: "row" | "column";
}) {
  return <div className={cn("ms-workbench-row workbench-project-viewport", className)} data-direction={direction} {...props} />;
}

export function WorkbenchProjectPane({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ms-workbench-copy workbench-project-pane", className)} {...props} />;
}
