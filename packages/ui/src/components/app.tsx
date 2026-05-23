import type { ComponentType, HTMLAttributes, ReactNode } from "react";

import { semanticToneClass, type SemanticTone } from "./semantic";
import { cn } from "../lib/cn";

export type IconComponent = ComponentType<{ size?: string | number; className?: string }>;

export function AppPage({
  children,
  className,
  width = "wide",
}: {
  children: ReactNode;
  className?: string;
  width?: "normal" | "wide" | "full";
}) {
  return (
    <div className={cn("app-page", className)}>
      <div
        className={cn(
          "app-page__content",
          `app-page__content--${width}`,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function AppPageHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
}: {
  icon?: IconComponent;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("app-page-header", className)}>
      <div className="app-page-header__lead">
        {Icon ? (
          <span className="app-page-header__icon">
            <Icon size={18} />
          </span>
        ) : null}
        <div className="app-page-header__copy">
          {eyebrow ? <div className="app-page-header__eyebrow">{eyebrow}</div> : null}
          <h1 className="app-page-header__title">{title}</h1>
          {description ? <p className="app-page-header__description">{description}</p> : null}
          {meta ? <div className="app-page-header__meta">{meta}</div> : null}
        </div>
      </div>
      {actions ? <div className="app-page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function ProjectSurfaceHeader({
  icon: Icon,
  title,
  description,
  meta,
  actions,
  className,
}: {
  icon: IconComponent;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("project-surface-header", className)}>
      <div className="project-surface-header__lead">
        <span className="project-surface-header__icon">
          <Icon size={18} />
        </span>
        <div className="project-surface-header__copy">
          <div className="project-surface-header__title-row">
            <h1 className="project-surface-header__title">{title}</h1>
            {meta}
          </div>
          {description ? <p className="project-surface-header__description">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="project-surface-header__actions">{actions}</div> : null}
    </header>
  );
}

export function AppSection({
  children,
  title,
  description,
  icon: Icon,
  action,
  className,
  bodyClassName,
}: {
  children: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  icon?: IconComponent;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("app-section", className)}>
      {title || description || Icon || action ? (
        <div className="app-section__header">
          <div className="app-section__heading">
            {Icon ? <Icon size={14} className="app-section__icon" /> : null}
            <div className="app-section__copy">
              {title ? <h2 className="app-section__title">{title}</h2> : null}
              {description ? <p className="app-section__description">{description}</p> : null}
            </div>
          </div>
          {action ? <div className="app-section__action">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn("app-section__body", bodyClassName)}>{children}</div>
    </section>
  );
}

export function AppPanel({
  children,
  title,
  icon: Icon,
  className,
  bodyClassName,
  ...props
}: HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  icon?: IconComponent;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("app-panel", className)} {...props}>
      {title || Icon ? (
        <div className="app-panel__header">
          {Icon ? <Icon size={14} className="app-panel__icon" /> : null}
          {title ? <h2 className="app-panel__title">{title}</h2> : null}
        </div>
      ) : null}
      <div className={cn("app-panel__body", bodyClassName)}>{children}</div>
    </section>
  );
}

export function AppKeyValue({
  label,
  value,
  strong = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value?: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className={cn("app-key-value", className)} {...props}>
      <p className="app-key-value__label">{label}</p>
      <p className={cn("app-key-value__value", strong && "app-key-value__value--strong")}>{value ?? "-"}</p>
    </div>
  );
}

export function AppStateMessage({
  icon,
  children,
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  tone?: "neutral" | "danger";
}) {
  return (
    <div className={cn("app-state-message", `app-state-message--${tone}`, className)} {...props}>
      {icon ? <span className="app-state-message__icon">{icon}</span> : null}
      <span className="app-state-message__content">{children}</span>
    </div>
  );
}

export function AppInlineError({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("app-inline-error", className)} {...props}>
      {children}
    </div>
  );
}

export function AppTextEmptyState({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("app-text-empty-state", className)} {...props}>
      {children}
    </p>
  );
}

export function AppMetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
  compact = false,
}: {
  icon?: IconComponent;
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  tone?: SemanticTone;
  compact?: boolean;
}) {
  return (
    <div className={cn("app-metric-card", compact && "app-metric-card--compact")}>
      <div className="app-metric-card__row">
        <div className="app-metric-card__copy">
          <p className="app-metric-card__label">{label}</p>
          <p className="app-metric-card__value">{value}</p>
        </div>
        {Icon ? (
          <span className="app-metric-card__icon">
            <Icon size={compact ? 15 : 18} className={semanticToneClass(tone, "icon")} />
          </span>
        ) : null}
      </div>
      {detail ? <p className="app-metric-card__detail">{detail}</p> : null}
    </div>
  );
}

export function AppEmptyState({
  icon: Icon,
  title,
  detail,
  action,
  compact = false,
}: {
  icon?: IconComponent;
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("app-empty-state", compact && "app-empty-state--compact")}>
      {Icon ? (
        <span className="app-empty-state__icon">
          <Icon size={compact ? 18 : 24} />
        </span>
      ) : null}
      <p className="app-empty-state__title">{title}</p>
      {detail ? <p className="app-empty-state__detail">{detail}</p> : null}
      {action ? <div className="app-empty-state__action">{action}</div> : null}
    </div>
  );
}
