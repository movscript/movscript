import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { Badge } from "../../../../primitives";
import { AppTextEmptyState } from "../../../app";
import { WorkbenchSurfaceItem } from "../../../workbench";

export function ResourceCandidateList({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("resource-candidate-attach__resource-list", className)} {...props}>
      {children}
    </div>
  );
}

export function ResourceCandidateEmpty({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <AppTextEmptyState className={cn("ms-type-tiny resource-candidate-attach__empty", className)} {...props}>
      {children}
    </AppTextEmptyState>
  );
}

export function ResourceCandidateItem({
  active,
  name,
  meta,
  badge,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  name: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <WorkbenchSurfaceItem active={active} density="compact" className={cn("resource-candidate-item", className)} {...props}>
      <div className="ms-action-row resource-candidate-item__row">
        <p className="ms-text-truncate ms-type-tiny resource-candidate-item__name">{name}</p>
        {badge ? <Badge variant="outline" className="ms-type-tiny resource-candidate-item__badge">{badge}</Badge> : null}
      </div>
      {meta ? <p className="ms-text-truncate ms-type-tiny resource-candidate-item__meta">{meta}</p> : null}
    </WorkbenchSurfaceItem>
  );
}
