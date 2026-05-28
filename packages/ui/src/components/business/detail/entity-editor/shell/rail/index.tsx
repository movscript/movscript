import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { AppPanel, AppSurfaceItem } from "../../../../app";
import { Button } from "../../../../../primitives";

export function DetailEntityHorizontalRail({
  title,
  subtitle,
  icon,
  expandLabel,
  onExpand,
  className,
  ...props
}: {
  title: ReactNode;
  subtitle: ReactNode;
  icon: ReactNode;
  expandLabel: string;
  onExpand: () => void;
  className?: string;
} & Omit<ComponentPropsWithoutRef<typeof AppPanel>, "icon">) {
  return (
    <AppPanel className={className} bodyClassName="detail-entity-rail" {...props}>
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
