import type { ComponentProps, ComponentPropsWithoutRef, HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { AppContentLayout } from "../../../layout";
import { AppEmptyState, AppStateMessage } from "../../app";
import { Button, type ButtonProps } from "../../../primitives";
import { SettingsIcon, XIcon } from "../../../primitives/icons";

export function ProjectPageActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("project-page-action-button", className)} {...props} />;
}

export function ProjectOverviewPageLayout(props: ComponentPropsWithoutRef<typeof AppContentLayout>) {
  return <AppContentLayout variant="contained" width="xwide" contentClassName="project-overview-page" {...props} />;
}

export function ProjectListPageLayout({
  className,
  contentClassName,
  ...props
}: ComponentPropsWithoutRef<typeof AppContentLayout>) {
  return (
    <AppContentLayout
      variant="contained"
      width="normal"
      className={cn("project-list-page-layout", className)}
      contentClassName={cn("projects-page project-list-page", contentClassName)}
      {...props}
    />
  );
}

export function ProjectOverviewStatusHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-overview-status-header", className)} {...props} />;
}

export function ProjectOverviewTitleGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-overview-title-group", className)} {...props} />;
}

export function ProjectOverviewTitleRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-overview-title-row", className)} {...props} />;
}

export function ProjectOverviewBodyCopy({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("project-overview-body-copy", className)} {...props} />;
}

export function ProjectOverviewMetricGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-overview-metric-grid", className)} {...props} />;
}

export function ProjectOverviewMetaGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-overview-meta-grid", className)} {...props} />;
}

export function ProjectOverviewLaneGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-overview-lane-grid", className)} {...props} />;
}

export function ProjectOverviewPanelHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-overview-panel-header", className)} {...props} />;
}

export function ProjectOverviewEntryStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-overview-entry-stack", className)} {...props} />;
}

export function ProjectOverviewEntryContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-overview-entry-content", className)} {...props} />;
}

export function ProjectOverviewEntryTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("project-overview-entry-title", className)} {...props} />;
}

export function ProjectOverviewEntryDetail({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("project-overview-entry-detail", className)} {...props} />;
}

export function ProjectOverviewLaneHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-overview-lane-header", className)} {...props} />;
}

export function ProjectOverviewLaneContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-overview-lane-content", className)} {...props} />;
}

export function ProjectOverviewLaneProgress({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-overview-lane-progress", className)} {...props} />;
}

export function ProjectOverviewLaneActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-overview-lane-actions", className)} {...props} />;
}

export function ProjectPageEmptyState({
  className,
  ...props
}: ComponentProps<typeof AppEmptyState>) {
  return <AppEmptyState className={cn("project-page-empty-state", className)} {...props} />;
}

export function ProjectPageLocalAdminPrompt({
  title,
  description,
  openLabel,
  dismissLabel,
  closeLabel,
  onOpenModels,
  onDismiss,
  className,
}: {
  title: ReactNode;
  description: ReactNode;
  openLabel: ReactNode;
  dismissLabel: ReactNode;
  closeLabel: string;
  onOpenModels: () => void;
  onDismiss: () => void;
  className?: string;
}) {
  return (
    <AppStateMessage tone="info" className={cn("project-page-local-admin-prompt", className)}>
      <div className="project-page-local-admin-prompt__layout">
        <div className="project-page-local-admin-prompt__icon">
          <SettingsIcon size={16} />
        </div>
        <div className="project-page-local-admin-prompt__body">
          <p className="project-page-local-admin-prompt__title">{title}</p>
          <p className="project-page-local-admin-prompt__description">{description}</p>
          <div className="project-page-local-admin-prompt__actions">
            <ProjectPageActionButton type="button" size="sm" onClick={onOpenModels}>
              {openLabel}
            </ProjectPageActionButton>
            <ProjectPageActionButton type="button" variant="ghost" size="sm" onClick={onDismiss}>
              {dismissLabel}
            </ProjectPageActionButton>
          </div>
        </div>
        <ProjectPageActionButton
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onDismiss}
          className="project-page-local-admin-prompt__close"
          aria-label={closeLabel}
        >
          <XIcon size={14} />
        </ProjectPageActionButton>
      </div>
    </AppStateMessage>
  );
}
