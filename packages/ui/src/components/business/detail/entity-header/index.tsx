import type { ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { DetailPill } from "../badge";
import type { DetailHeaderAttributes, DetailSurfaceMode } from "../types";

export function DetailEntityHeader({
  surface = "content",
  icon,
  kindLabel,
  title,
  description,
  eyebrow,
  meta,
  actions,
  nodeBadge,
  className,
  iconClassName,
  iconToneClassName,
  children,
  ...props
}: DetailHeaderAttributes & {
  surface?: DetailSurfaceMode;
  icon?: ReactNode;
  iconClassName?: string;
  iconToneClassName?: string;
  kindLabel?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  nodeBadge?: ReactNode;
}) {
  return (
    <header data-surface={surface} className={cn("detail-entity-header", className)} {...props}>
      <div className="detail-entity-header__lead">
        {icon ? (
          <span className={cn("detail-entity-header__icon", iconToneClassName)}>
            <span className={cn("detail-entity-header__icon-glyph", iconClassName)}>{icon}</span>
          </span>
        ) : null}
        <div className="detail-entity-header__copy">
          <div className="detail-entity-header__title-row">
            {kindLabel ? <DetailPill className="detail-entity-header__kind">{kindLabel}</DetailPill> : null}
            {eyebrow}
            <h1 className="detail-entity-header__title">{title}</h1>
            {nodeBadge}
          </div>
          {(description || meta || children) ? (
            <div className="detail-entity-header__meta-row">
              {description ? <p className="detail-entity-header__description">{description}</p> : null}
              {meta ? <div className="detail-entity-header__meta">{meta}</div> : null}
              {children}
            </div>
          ) : null}
        </div>
      </div>
      {actions ? <div className="detail-entity-header__actions">{actions}</div> : null}
    </header>
  );
}
