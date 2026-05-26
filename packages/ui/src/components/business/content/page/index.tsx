import { forwardRef, type ButtonHTMLAttributes, type DetailsHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { accentGradientClass, accentSoftClass, accentTextClass, toneTextClass, type AccentTone, type SemanticTone } from "../../../../semantic";
import { cn } from "../../../../lib/cn";
import { Button, type ButtonProps, Progress, StatusBadge } from "../../../primitives";
import type { IconComponent } from "../../../primitives/types";
import { AppDisclosure, AppEmptyState, AppIconFrame, AppInfoBlock, AppInlineMeta, AppKeyValue, AppMetricCard, AppPanel, AppSection, AppSurfaceItem, AppTextEmptyState } from "../../app";
import { WorkbenchList, WorkbenchListItem, WorkbenchSurfaceItem } from "../../workbench";

export interface ContentPageActionButtonProps extends ButtonProps {
  surface?: "default" | "overlay";
}

export const ContentPageActionButton = forwardRef<HTMLButtonElement, ContentPageActionButtonProps>(
  ({ className, surface = "default", ...props }, ref) => (
    <Button
      ref={ref}
      className={cn(
        "content-page-action-button",
        surface === "overlay" && "content-page-action-button--overlay",
        className,
      )}
      {...props}
    />
  ),
);
ContentPageActionButton.displayName = "ContentPageActionButton";

export function ContentPageSection({
  children,
  className,
  bodyClassName,
  ...props
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
    <AppSection
      className={cn("content-page-section", className)}
      bodyClassName={cn("content-page-section__body", bodyClassName)}
      {...props}
    >
      {children}
    </AppSection>
  );
}

export function ContentPagePanel({
  children,
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
    <AppPanel
      className={cn("content-page-panel", className)}
      bodyClassName={cn("content-page-panel__body", bodyClassName)}
      {...props}
    >
      {children}
    </AppPanel>
  );
}

export function ContentPageDetailPanel({
  children,
  className,
  bodyClassName,
  bodyMode = "default",
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  icon?: IconComponent;
  iconClassName?: string;
  action?: ReactNode;
  bodyClassName?: string;
  bodyMode?: "default" | "flush" | "stack";
}) {
  return (
    <AppPanel
      className={cn("content-page-detail-panel", className)}
      bodyClassName={cn("content-page-detail-panel__body", `content-page-detail-panel__body--${bodyMode}`, bodyClassName)}
      {...props}
    >
      {children}
    </AppPanel>
  );
}

export function ContentPageDetailHero({
  accent = "cyan",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  accent?: AccentTone;
}) {
  return <div className={cn("content-page-detail-hero", accentGradientClass(accent), className)} {...props} />;
}

export function ContentPageDetailHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-page-detail-header", className)} {...props} />;
}

export function ContentPageDetailIdentity({
  icon,
  accent = "cyan",
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  accent?: AccentTone;
}) {
  return (
    <div className={cn("content-page-detail-identity", className)} {...props}>
      {icon ? (
        <span className={cn("content-page-detail-identity__icon", accentSoftClass(accent), accentTextClass(accent))}>
          {icon}
        </span>
      ) : null}
      <div className="content-page-detail-identity__body">{children}</div>
    </div>
  );
}

export function ContentPageDetailSummary({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-page-detail-summary", className)} {...props} />;
}

export function ContentPageDetailActionStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-page-detail-action-stack", className)} {...props} />;
}

export function ContentPageActionRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-page-action-row", className)} {...props} />;
}

export function ContentPageHeaderRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-page-header-row", className)} {...props} />;
}

export function ContentPageFieldGrid({
  className,
  columns = "four",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  columns?: "two" | "three" | "four" | "responsive-three";
}) {
  return <div className={cn("content-page-field-grid", `content-page-field-grid--${columns}`, className)} {...props} />;
}

export function ContentPageFieldCard({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  asChild?: boolean;
  density?: "normal" | "compact";
  variant?: "card" | "overlay" | "muted";
}) {
  return <ContentPageSurfaceItem className={cn("content-page-field-card", className)} {...props} />;
}

export function ContentPageDetailMetricGrid({
  className,
  columns = "five",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  columns?: "three" | "five";
}) {
  return <div className={cn("content-page-detail-metric-grid", `content-page-detail-metric-grid--${columns}`, className)} {...props} />;
}

export function ContentPageDetailSectionStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-page-detail-section-stack", className)} {...props} />;
}

export function ContentPageSplitColumns({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-page-split-columns", className)} {...props} />;
}

export function ContentPageStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-page-stack", className)} {...props} />;
}

export function ContentPageInfoGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-page-info-grid", className)} {...props} />;
}

export function ContentPageRelatedGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-page-related-grid", className)} {...props} />;
}

export function ContentPageSectionHeading({
  icon: Icon,
  title,
  count,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: IconComponent;
  title: ReactNode;
  count?: ReactNode;
}) {
  return (
    <div className={cn("content-page-section-heading", className)} {...props}>
      <div className="content-page-section-heading__title">
        {Icon ? <Icon size={14} className="content-page-section-heading__icon" /> : null}
        <p className="content-page-section-heading__label">{title}</p>
      </div>
      {count !== undefined ? <div className="content-page-section-heading__count">{count}</div> : null}
    </div>
  );
}

export function ContentPageSurfaceItem({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  asChild?: boolean;
  density?: "normal" | "compact";
  variant?: "card" | "overlay" | "muted";
}) {
  return (
    <AppSurfaceItem className={cn("content-page-surface-item", className)} {...props}>
      {children}
    </AppSurfaceItem>
  );
}

export function ContentPageMeta({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  asChild?: boolean;
  icon?: IconComponent;
  iconClassName?: string;
}) {
  return (
    <AppInlineMeta className={cn("content-page-meta", className)} {...props}>
      {children}
    </AppInlineMeta>
  );
}

export function ContentPageTextEmptyState({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <AppTextEmptyState className={cn("content-page-text-empty-state", className)} {...props} />;
}

export function ContentPageEmptyState({
  className,
  ...props
}: Parameters<typeof AppEmptyState>[0]) {
  return <AppEmptyState className={cn("content-page-empty-state", className)} {...props} />;
}

export function ContentPageMetricCard({
  compact = true,
  ...props
}: Parameters<typeof AppMetricCard>[0]) {
  return <AppMetricCard compact={compact} {...props} />;
}

export function ContentPageKeyValue({
  className,
  ...props
}: Parameters<typeof AppKeyValue>[0]) {
  return <AppKeyValue className={cn("content-page-key-value", className)} {...props} />;
}

export function ContentPageStatusBadge({
  className,
  ...props
}: Parameters<typeof StatusBadge>[0]) {
  return <StatusBadge className={cn("content-page-status-badge", className)} {...props} />;
}

export function ContentPageToneText({
  as: Element = "span",
  tone,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "div" | "p" | "span";
  tone: SemanticTone;
}) {
  return (
    <Element className={cn("content-page-tone-text", toneTextClass(tone), className)} {...props}>
      {children}
    </Element>
  );
}

export function ContentPageDisclosure({
  className,
  bodyClassName,
  ...props
}: Omit<DetailsHTMLAttributes<HTMLDetailsElement>, "title"> & {
  title: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <AppDisclosure
      className={cn("content-page-disclosure", className)}
      bodyClassName={cn("content-page-disclosure__body", bodyClassName)}
      {...props}
    />
  );
}

export function ContentPageIconFrame({ className, ...props }: HTMLAttributes<HTMLSpanElement> & { size?: "sm" | "md" | "lg" }) {
  return <AppIconFrame className={cn("content-page-icon-frame", className)} {...props} />;
}

export function ContentPageInfoBlock({
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
    <AppInfoBlock
      className={cn("content-page-info-block", className)}
      valueClassName={cn("content-page-info-block__value", valueClassName)}
      {...props}
    />
  );
}

export function ContentPageList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <WorkbenchList className={cn("content-page-list", className)} {...props} />;
}

export function ContentPageListViewport({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-page-list-viewport", className)} {...props} />;
}

export interface ContentPageListCardProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function ContentPageListCard({
  className,
  active,
  ...props
}: ContentPageListCardProps) {
  return (
    <WorkbenchListItem
      active={active}
      className={cn("content-page-list-card", className)}
      {...props}
    />
  );
}

export function ContentPageListCardHeader({
  children,
  aside,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  aside?: ReactNode;
}) {
  return (
    <div className={cn("content-page-list-card__header", className)} {...props}>
      <div className="content-page-list-card__header-main">{children}</div>
      {aside ? <div className="content-page-list-card__aside">{aside}</div> : null}
    </div>
  );
}

export function ContentPageListCardIdentity({
  icon,
  accent = "cyan",
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  accent?: AccentTone;
}) {
  return (
    <div className={cn("content-page-list-card__identity", className)} {...props}>
      {icon ? (
        <span className={cn("content-page-list-card__icon", accentSoftClass(accent), accentTextClass(accent))}>
          {icon}
        </span>
      ) : null}
      <div className="content-page-list-card__identity-body">{children}</div>
    </div>
  );
}

export function ContentPageListCardTitle({
  children,
  prefix,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLHeadingElement>, "prefix"> & {
  prefix?: ReactNode;
}) {
  return (
    <h3 className={cn("content-page-list-card__title", className)} {...props}>
      {prefix ? <span className="content-page-list-card__title-prefix">{prefix}</span> : null}
      <span className="content-page-list-card__title-text">{children}</span>
    </h3>
  );
}

export function ContentPageListCardSubtitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("content-page-list-card__subtitle", className)} {...props} />;
}

export function ContentPageListCardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("content-page-list-card__description", className)} {...props} />;
}

export function ContentPageListCardStatusGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-page-list-card__status-group", className)} {...props} />;
}

export function ContentPageListCardMetaRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-page-list-card__meta-row", className)} {...props} />;
}

export function ContentPageListCardMetricGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-page-list-card__metric-grid", className)} {...props} />;
}

export function ContentPageListCardReadiness({
  value,
  label,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  value: number;
  label?: ReactNode;
}) {
  return (
    <div className={cn("content-page-list-card__readiness", className)} {...props}>
      <Progress value={value} className="content-page-list-card__readiness-progress" />
      <span className="content-page-list-card__readiness-value">{label ?? `${value}%`}</span>
    </div>
  );
}

export function ContentPageCheckRow({
  ok,
  label,
  detail,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  ok: boolean;
  label: ReactNode;
  detail: ReactNode;
}) {
  const Icon = ok ? CheckCircle2 : AlertTriangle;
  return (
    <AppSurfaceItem className={cn("content-page-check-row", className)} {...props}>
      <Icon
        size={14}
        className={cn(
          "content-page-check-row__icon",
          toneTextClass(ok ? "success" : "warning"),
        )}
      />
      <div className="content-page-check-row__body">
        <p className="content-page-check-row__label">{label}</p>
        <p className="content-page-check-row__detail">{detail}</p>
      </div>
    </AppSurfaceItem>
  );
}

export function ContentPageRelatedStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-page-related-stack", className)} {...props} />;
}

export function ContentPageRelatedItem({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <WorkbenchSurfaceItem className={cn("content-page-related-item", className)} {...props} />;
}

export function ContentPageRelatedActionItem({
  className,
  active,
  ...props
}: ContentPageListCardProps) {
  return (
    <WorkbenchListItem
      active={active}
      className={cn("content-page-related-item", className)}
      {...props}
    />
  );
}

export function ContentPageRelatedHeader({
  children,
  aside,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  aside?: ReactNode;
}) {
  return (
    <div className={cn("content-page-related-item__header", className)} {...props}>
      <div className="content-page-related-item__body">{children}</div>
      {aside ? <div className="content-page-related-item__aside">{aside}</div> : null}
    </div>
  );
}

export function ContentPageRelatedTitle({
  children,
  prefix,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLParagraphElement>, "prefix"> & {
  prefix?: ReactNode;
}) {
  return (
    <p className={cn("content-page-related-item__title", className)} {...props}>
      {prefix ? <span className="content-page-related-item__title-prefix">{prefix}</span> : null}
      <span className="content-page-related-item__title-text">{children}</span>
    </p>
  );
}

export function ContentPageRelatedDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("content-page-related-item__description", className)} {...props} />;
}

export function ContentPageRelatedMetaRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-page-related-item__meta-row", className)} {...props} />;
}

export interface ContentPageSummaryGridProps extends HTMLAttributes<HTMLElement> {
  columns?: "four" | "two-to-four";
}

export const ContentPageSummaryGrid = forwardRef<HTMLElement, ContentPageSummaryGridProps>(
  ({ className, columns = "four", ...props }, ref) => (
    <section
      ref={ref}
      className={cn("content-page-summary-grid", `content-page-summary-grid--${columns}`, className)}
      {...props}
    />
  ),
);
ContentPageSummaryGrid.displayName = "ContentPageSummaryGrid";
