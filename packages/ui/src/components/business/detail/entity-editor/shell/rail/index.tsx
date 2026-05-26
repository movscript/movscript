import type { ReactNode } from "react";

import { AppPanel, AppSurfaceItem } from "../../../../app";
import { Button } from "../../../../../primitives";

export function DetailEntityHorizontalRail({
  title,
  subtitle,
  icon,
  expandLabel,
  onExpand,
  className,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  icon: ReactNode;
  expandLabel: string;
  onExpand: () => void;
  className?: string;
}) {
  return (
    <AppPanel className={className} bodyClassName="detail-entity-rail">
      <Button
        type="button"
        variant="ghost"
        className="detail-entity-rail__button"
        title={expandLabel}
        aria-label={expandLabel}
        onClick={onExpand}
      >
        <AppSurfaceItem className="detail-entity-rail__icon">
          {icon}
        </AppSurfaceItem>
        <span className="detail-entity-rail__title-wrap">
          <span className="detail-entity-rail__title">{title}</span>
        </span>
        <span className="detail-entity-rail__subtitle">{subtitle}</span>
      </Button>
    </AppPanel>
  );
}
