import type { ButtonHTMLAttributes, ComponentType, HTMLAttributes, ReactNode } from "react";

import { ImageIcon } from "./icons";
import { semanticStatusClass, semanticStatusLabel, type SemanticTone, semanticToneClass } from "./semantic";
import { cn } from "../lib/cn";

export type WorkbenchDensity = "compact" | "normal";
export type WorkbenchIconComponent = ComponentType<{ size?: string | number; className?: string }>;

export function WorkbenchSection({
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
  ...props
}: HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  description?: ReactNode;
  icon?: WorkbenchIconComponent;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("ms-surface workbench-section", className)} {...props}>
      {title || description || Icon || action ? (
        <div className="ms-surface__header workbench-section__header">
          <div className="ms-surface__heading workbench-section__heading">
            {Icon ? <Icon size={14} className="ms-surface__icon workbench-section__icon" /> : null}
            <div className="ms-surface__copy workbench-section__copy">
              {title ? <h2 className="ms-surface__title workbench-section__title">{title}</h2> : null}
              {description ? <p className="ms-surface__description workbench-section__description">{description}</p> : null}
            </div>
          </div>
          {action ? <div className="ms-surface__action workbench-section__action">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn("ms-surface__body workbench-section__body", bodyClassName)}>{children}</div>
    </section>
  );
}

export function WorkbenchList({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ms-workbench-list workbench-list", className)} {...props}>
      {children}
    </div>
  );
}

export function WorkbenchListItem({
  active,
  density = "normal",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  density?: WorkbenchDensity;
}) {
  return (
    <button type="button" data-active={active ? "true" : undefined} data-density={density} className={cn("ms-workbench-selectable workbench-list-item", className)} {...props}>
      {children}
    </button>
  );
}

export function WorkbenchSurfaceItem({
  active,
  density = "normal",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  density?: WorkbenchDensity;
}) {
  return (
    <div data-active={active ? "true" : undefined} data-density={density} className={cn("ms-workbench-selectable workbench-list-item", className)} {...props}>
      {children}
    </div>
  );
}

export function WorkbenchEntityCard({
  active,
  media,
  title,
  description,
  meta,
  status,
  action,
  className,
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> & {
  active?: boolean;
  media?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <button type="button" data-active={active ? "true" : undefined} className={cn("ms-workbench-selectable ms-workbench-row workbench-entity-card", className)} {...props}>
      {media ? <div className="workbench-entity-card__media">{media}</div> : null}
      <div className="ms-workbench-row workbench-entity-card__content">
        <div className="ms-workbench-copy workbench-entity-card__main">
          <p className="workbench-entity-card__title">{title}</p>
          {description ? <p className="workbench-entity-card__description">{description}</p> : null}
          {meta ? <div className="ms-workbench-wrap workbench-entity-card__meta">{meta}</div> : null}
        </div>
        {status || action ? (
          <div className="ms-workbench-side workbench-entity-card__aside">
            {status}
            {action}
          </div>
        ) : null}
      </div>
      {children}
    </button>
  );
}

export function WorkbenchThumbnail({
  children,
  icon: Icon = ImageIcon,
  label,
  fit = "cover",
  ratio = "default",
  className,
  ...props
}: {
  children?: ReactNode;
  icon?: WorkbenchIconComponent;
  label?: ReactNode;
  fit?: "cover" | "contain";
  ratio?: "square" | "wide" | "banner" | "default";
  className?: string;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-fit={fit} data-ratio={ratio} className={cn("ms-workbench-media-frame workbench-thumbnail", className)} {...props}>
      {children ? (
        <div className="workbench-thumbnail__media">{children}</div>
      ) : (
        <div className="ms-empty-state workbench-thumbnail__fallback">
          <Icon size={16} />
          {label ? <span>{label}</span> : null}
        </div>
      )}
    </div>
  );
}

export function WorkbenchStatusBadge({
  status,
  label,
  tone,
  className,
}: {
  status?: string | null;
  label?: ReactNode;
  tone?: SemanticTone;
  className?: string;
}) {
  const badgeClass = tone ? semanticToneClass(tone, "badge") : semanticStatusClass(status, "badge");
  return <span className={cn("ms-inline-badge ms-inline-badge--center ms-inline-badge--truncate workbench-status-badge", badgeClass, className)}>{label ?? semanticStatusLabel(status)}</span>;
}

export function WorkbenchMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
  compact = false,
  className,
}: {
  icon?: WorkbenchIconComponent;
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  tone?: SemanticTone;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("ms-stat-card workbench-metric", compact && "workbench-metric--compact", className)}>
      <div className="ms-stat-card__row workbench-metric__row">
        <div className="ms-stat-card__copy workbench-metric__copy">
          <p className="ms-stat-card__label workbench-metric__label">{label}</p>
          <p className="ms-stat-card__value workbench-metric__value">{value}</p>
        </div>
        {Icon ? (
          <span className="ms-center ms-stat-card__icon workbench-metric__icon">
            <Icon size={compact ? 14 : 16} className={semanticToneClass(tone, "icon")} />
          </span>
        ) : null}
      </div>
      {detail ? <p className="ms-stat-card__detail workbench-metric__detail">{detail}</p> : null}
    </div>
  );
}

export function WorkbenchKeyValue({
  label,
  value,
  strong,
  className,
}: {
  label: ReactNode;
  value?: ReactNode;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("ms-key-value workbench-key-value", className)}>
      <p className="ms-key-value__label workbench-key-value__label">{label}</p>
      <p className={cn("ms-key-value__value workbench-key-value__value", strong && "workbench-key-value__value--strong")}>{value || "无"}</p>
    </div>
  );
}

export function WorkbenchEmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon?: WorkbenchIconComponent;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("ms-empty-state workbench-empty-state", compact && "workbench-empty-state--compact", className)}>
      {Icon ? (
        <span className="ms-center ms-empty-state__icon workbench-empty-state__icon">
          <Icon size={compact ? 16 : 22} />
        </span>
      ) : null}
      <p className="ms-empty-state__title workbench-empty-state__title">{title}</p>
      {description ? <p className="ms-empty-state__description workbench-empty-state__description">{description}</p> : null}
      {action ? <div className="ms-empty-state__action workbench-empty-state__action">{action}</div> : null}
    </div>
  );
}
