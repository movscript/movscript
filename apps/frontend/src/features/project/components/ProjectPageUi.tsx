import type { ComponentProps, ComponentPropsWithoutRef, ReactNode } from "react";

import { AppContentLayout } from "@movscript/ui/layout";
import { AppEmptyState, AppStateMessage } from "@movscript/ui/business/app";
import { Button, SettingsIcon, XIcon, type ButtonProps } from "@movscript/ui/primitives";
import { cn } from "@/shared/ui/cn";
import "./ProjectPageUi.css";

export function ProjectPageActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("project-page-action-button", className)} {...props} />;
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
