import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import type { ButtonProps } from "../../../../primitives/button";
import { AppTextEmptyState } from "../../../app";
import { WorkbenchList, WorkbenchListItem, WorkbenchSurfaceItem } from "../../../workbench";

export function ResourceCandidateTargetList({
  compact = false,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  compact?: boolean;
}) {
  return (
    <WorkbenchList data-compact={compact ? "true" : undefined} className={cn("resource-candidate-target-list", className)} {...props}>
      {children}
    </WorkbenchList>
  );
}

export function ResourceCandidateTargetEmpty({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <AppTextEmptyState className={cn("resource-candidate-target-empty", className)} {...props}>
      {children}
    </AppTextEmptyState>
  );
}

export function ResourceCandidateTargetItem({
  active,
  title,
  idLabel,
  meta,
  description,
  className,
  ...props
}: ButtonProps & {
  active?: boolean;
  title: ReactNode;
  idLabel?: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <WorkbenchListItem active={active} density="compact" className={cn("resource-candidate-target-item", className)} {...props}>
      <div className="resource-candidate-target-item__row">
        <p className="resource-candidate-target-item__title">{title}</p>
        {idLabel ? <span className="resource-candidate-target-item__id">{idLabel}</span> : null}
      </div>
      {meta ? <p className="resource-candidate-target-item__meta">{meta}</p> : null}
      {description ? <p className="resource-candidate-target-item__description">{description}</p> : null}
    </WorkbenchListItem>
  );
}

export function ResourceCandidateSelectedTarget({
  title,
  meta,
  description,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <WorkbenchSurfaceItem active density="compact" className={cn("resource-candidate-selected-target", className)} {...props}>
      <p className="resource-candidate-selected-target__title">{title}</p>
      {meta ? <p className="resource-candidate-selected-target__meta">{meta}</p> : null}
      {description ? <p className="resource-candidate-selected-target__description">{description}</p> : null}
    </WorkbenchSurfaceItem>
  );
}
