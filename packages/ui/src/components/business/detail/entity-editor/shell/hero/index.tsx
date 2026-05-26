import type { ReactNode } from "react";

import { cn } from "../../../../../../lib/cn";
import { accentGradientClass, type AccentTone } from "../../../../../../semantic";
import { AppPanel, AppSurfaceItem } from "../../../../app";
import type { DetailEntityEditorStat } from "../../types";
import { DetailEntityEditorStats } from "../stats";

export function DetailEntityEditorHero({
  icon,
  eyebrow,
  title,
  subtitle,
  summary,
  description,
  status,
  actions,
  stats,
  compact = false,
  collapsed = false,
  accentTone = "neutral",
  accentClassName,
  className,
  children,
}: {
  icon?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  summary?: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  stats?: DetailEntityEditorStat[];
  compact?: boolean;
  collapsed?: boolean;
  accentTone?: AccentTone;
  accentClassName?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <AppPanel className={className} bodyClassName="detail-entity-editor-shell">
      <div className={cn("detail-entity-editor-hero", compact && "detail-entity-editor-hero--compact", !compact && accentGradientClass(accentTone), accentClassName)}>
        <div className="detail-entity-editor-hero__layout">
          <div className="detail-entity-editor-hero__content">
            <div className="detail-entity-editor-hero__lead">
              {icon ? (
                <AppSurfaceItem className="detail-entity-editor-hero__icon" variant={compact ? "muted" : "overlay"}>
                  {icon}
                </AppSurfaceItem>
              ) : null}
              <div className="detail-entity-editor-hero__copy">
                {eyebrow ? <div className="detail-entity-editor-hero__eyebrow">{eyebrow}</div> : null}
                <h2 className="detail-entity-editor-hero__title">{title}</h2>
                {subtitle ? <div className="detail-entity-editor-hero__subtitle">{subtitle}</div> : null}
              </div>
            </div>
            {summary ? <div className="detail-entity-editor-hero__summary">{summary}</div> : null}
          </div>
          {(status || actions) ? (
            <div className="detail-entity-editor-hero__aside">
              {status}
              {actions}
            </div>
          ) : null}
        </div>
        {description ? <p className="detail-entity-editor-hero__description">{description}</p> : null}
      </div>
      {!collapsed && stats?.length ? <DetailEntityEditorStats stats={stats} compact={compact} /> : null}
      {children}
    </AppPanel>
  );
}
