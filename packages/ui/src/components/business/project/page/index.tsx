import type { ComponentProps, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { AppEmptyState, AppStateMessage } from "../../app";
import { Button, type ButtonProps } from "../../../primitives";
import { SettingsIcon, XIcon } from "../../../primitives/icons";

export function ProjectPageActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("project-page-action-button", className)} {...props} />;
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
