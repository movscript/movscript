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
    <header className={cn("ms-page-header app-page-header", className)}>
      <div className="ms-page-header__lead app-page-header__lead">
        {Icon ? (
          <span className="ms-center ms-page-header__icon app-page-header__icon">
            <Icon size={18} />
          </span>
        ) : null}
        <div className="ms-page-header__copy app-page-header__copy">
          {eyebrow ? <div className="ms-page-header__cluster app-page-header__eyebrow">{eyebrow}</div> : null}
          <h1 className="ms-page-header__title app-page-header__title">{title}</h1>
          {description ? <p className="ms-page-header__description app-page-header__description">{description}</p> : null}
          {meta ? <div className="ms-page-header__cluster app-page-header__meta">{meta}</div> : null}
        </div>
      </div>
      {actions ? <div className="ms-page-header__actions app-page-header__actions">{actions}</div> : null}
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
    <header className={cn("ms-page-header project-surface-header", className)}>
      <div className="ms-page-header__lead project-surface-header__lead">
        <span className="ms-center ms-page-header__icon project-surface-header__icon">
          <Icon size={18} />
        </span>
        <div className="ms-page-header__copy project-surface-header__copy">
          <div className="ms-page-header__cluster project-surface-header__title-row">
            <h1 className="ms-page-header__title project-surface-header__title">{title}</h1>
            {meta}
          </div>
          {description ? <p className="ms-page-header__description project-surface-header__description">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="ms-page-header__actions project-surface-header__actions">{actions}</div> : null}
    </header>
  );
}

export function AppSection({
  children,
  eyebrow,
  title,
  description,
  icon: Icon,
  iconClassName,
  action,
  className,
  bodyClassName,
}: {
  children: ReactNode;
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  icon?: IconComponent;
  iconClassName?: string;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("ms-surface app-section", className)}>
      {title || description || Icon || action ? (
        <div className="ms-surface__header app-section__header">
          <div className="ms-surface__heading app-section__heading">
            {Icon ? <Icon size={14} className={cn("ms-surface__icon app-section__icon", iconClassName)} /> : null}
            <div className="ms-surface__copy app-section__copy">
              {eyebrow ? <div className="app-section__eyebrow">{eyebrow}</div> : null}
              {title ? <h2 className="ms-surface__title app-section__title">{title}</h2> : null}
              {description ? <p className="ms-surface__description app-section__description">{description}</p> : null}
            </div>
          </div>
          {action ? <div className="ms-surface__action app-section__action">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn("ms-surface__body app-section__body", bodyClassName)}>{children}</div>
    </section>
  );
}

export function AppPanel({
  children,
  title,
  icon: Icon,
  iconClassName,
  action,
  className,
  bodyClassName,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  icon?: IconComponent;
  iconClassName?: string;
  action?: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("ms-surface app-panel", className)} {...props}>
      {title || Icon || action ? (
        <div className="ms-surface__header app-panel__header">
          <div className="ms-surface__heading app-panel__heading">
            {Icon ? <Icon size={14} className={cn("ms-surface__icon app-panel__icon", iconClassName)} /> : null}
            {title ? <h2 className="ms-surface__title app-panel__title">{title}</h2> : null}
          </div>
          {action ? <div className="ms-surface__action app-panel__action">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn("ms-surface__body app-panel__body", bodyClassName)}>{children}</div>
    </section>
  );
}

export function AppKeyValue({
  label,
  value,
  strong = false,
  className,
  valueClassName,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value?: ReactNode;
  strong?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className={cn("ms-key-value app-key-value", className)} {...props}>
      <p className="ms-key-value__label app-key-value__label">{label}</p>
      <p className={cn("ms-key-value__value app-key-value__value", strong && "app-key-value__value--strong", valueClassName)}>{value ?? "-"}</p>
    </div>
  );
}

export function AppInfoBlock({
  label,
  value,
  surface = "plain",
  prominent = false,
  className,
  valueClassName,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value?: ReactNode;
  surface?: "plain" | "card";
  prominent?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className={cn("app-info-block", surface === "card" && "app-surface-item", prominent && "app-info-block--prominent", className)} {...props}>
      <p className="app-info-block__label">{label}</p>
      <p className={cn("app-info-block__value", valueClassName)}>{value ?? "-"}</p>
    </div>
  );
}

export function AppSurfaceItem({
  children,
  density = "normal",
  variant = "card",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  density?: "normal" | "compact";
  variant?: "card" | "overlay" | "muted";
}) {
  return (
    <div data-density={density} data-variant={variant} className={cn("app-surface-item", className)} {...props}>
      {children}
    </div>
  );
}

export function AppDisclosure({
  title,
  children,
  className,
  bodyClassName,
  ...props
}: Omit<HTMLAttributes<HTMLDetailsElement>, "title"> & {
  title: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <details className={cn("ms-frame app-disclosure", className)} {...props}>
      <summary className="ms-frame__header app-disclosure__summary">{title}</summary>
      <div className={cn("ms-frame__body app-disclosure__body", bodyClassName)}>{children}</div>
    </details>
  );
}

export function AppInlineMeta({
  icon: Icon,
  children,
  className,
  iconClassName,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: IconComponent;
  iconClassName?: string;
}) {
  return (
    <div className={cn("ms-inline-badge ms-inline-badge--truncate app-inline-meta", className)} {...props}>
      {Icon ? <Icon size={12} className={cn("app-inline-meta__icon", iconClassName)} /> : null}
      <span className="app-inline-meta__text">{children}</span>
    </div>
  );
}

export function AppStateMessage({
  icon,
  children,
  text,
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  text?: ReactNode;
  tone?: "neutral" | "danger";
}) {
  return (
    <div className={cn("app-state-message", `app-state-message--${tone}`, className)} {...props}>
      {icon ? <span className="app-state-message__icon">{icon}</span> : null}
      <span className="app-state-message__content">{children ?? text}</span>
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
    <div className={cn("ms-stat-card app-metric-card", compact && "app-metric-card--compact")}>
      <div className="ms-stat-card__row app-metric-card__row">
        <div className="ms-stat-card__copy app-metric-card__copy">
          <p className="ms-stat-card__label app-metric-card__label">{label}</p>
          <p className="ms-stat-card__value app-metric-card__value">{value}</p>
        </div>
        {Icon ? (
          <span className="ms-center ms-stat-card__icon app-metric-card__icon">
            <Icon size={compact ? 15 : 18} className={semanticToneClass(tone, "icon")} />
          </span>
        ) : null}
      </div>
      {detail ? <p className="ms-stat-card__detail app-metric-card__detail">{detail}</p> : null}
    </div>
  );
}

export function AppEmptyState({
  icon: Icon,
  title,
  detail,
  action,
  compact = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: IconComponent;
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("ms-empty-state app-empty-state", compact && "app-empty-state--compact", className)} {...props}>
      {Icon ? (
        <span className="ms-center ms-empty-state__icon app-empty-state__icon">
          <Icon size={compact ? 18 : 24} />
        </span>
      ) : null}
      <p className="ms-empty-state__title app-empty-state__title">{title}</p>
      {detail ? <p className="ms-empty-state__description app-empty-state__detail">{detail}</p> : null}
      {action ? <div className="ms-empty-state__action app-empty-state__action">{action}</div> : null}
    </div>
  );
}
