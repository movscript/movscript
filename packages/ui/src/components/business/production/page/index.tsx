import type { ButtonHTMLAttributes, ComponentPropsWithoutRef, HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { Button, Badge, Progress, StatusBadge, type ButtonProps } from "../../../primitives";
import type { IconComponent } from "../../../primitives/types";
import { AppContentLayout } from "../../../layout";
import { AppIconFrame, AppMarkerDot, AppSection } from "../../app";
import { AppEmptyState, AppMetricCard } from "../../app";
import { WorkbenchListItem, WorkbenchSurfaceItem } from "../../workbench";

export function ProductionPageLayout(props: ComponentPropsWithoutRef<typeof AppContentLayout>) {
  return <AppContentLayout variant="workspace" padding="none" scroll="hidden" contentClassName="production-page-layout" {...props} />;
}

export function ProductionPageHeaderFrame({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-page-header-frame", className)} {...props} />;
}

export function ProductionPageScrollArea({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-page-scroll-area", className)} {...props} />;
}

export function ProductionPageStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-page-stack", className)} {...props} />;
}

export function ProductionPageMain({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <main className={cn("production-page-main", className)} {...props} />;
}

export function ProductionPageBadge({ className, ...props }: ComponentPropsWithoutRef<typeof Badge>) {
  return <Badge className={cn("production-page-badge", className)} {...props} />;
}

export function ProductionPageStatusBadge({
  label,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof StatusBadge> & {
  label: ReactNode;
}) {
  return <StatusBadge className={cn("production-page-status-badge", className)} {...props}>{label}</StatusBadge>;
}

export function ProductionPageActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("production-page-action-button", className)} {...props} />;
}

export function ProductionPageMetric(props: ComponentPropsWithoutRef<typeof AppMetricCard>) {
  return <AppMetricCard {...props} />;
}

export function ProductionPageEmptyState(props: ComponentPropsWithoutRef<typeof AppEmptyState>) {
  return <AppEmptyState {...props} />;
}

export function ProductionPageEmptyActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-page-empty-actions", className)} {...props} />;
}

export function ProductionPageSectionActionText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("production-page-section-action-text", className)} {...props} />;
}

export function ProductionPageSection({
  children,
  className,
  bodyClassName,
  bodyVariant,
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
  bodyVariant?: "metrics" | "cards" | "stats" | "areas" | "units";
}) {
  return (
    <AppSection
      className={cn("production-page-section", className)}
      bodyClassName={cn(
        "production-page-section__body",
        bodyVariant === "metrics" && "production-page-section__body--metrics",
        bodyVariant === "cards" && "production-page-section__body--cards",
        bodyVariant === "stats" && "production-page-section__body--stats",
        bodyVariant === "areas" && "production-page-section__body--areas",
        bodyVariant === "units" && "production-page-section__body--units",
        bodyClassName,
      )}
      {...props}
    >
      {children}
    </AppSection>
  );
}

export interface ProductionPageListCardProps extends HTMLAttributes<HTMLDivElement> {
  active?: boolean;
  onSelect: () => void;
  footer?: ReactNode;
}

export function ProductionPageListCard({
  active,
  onSelect,
  footer,
  children,
  className,
  ...props
}: ProductionPageListCardProps) {
  return (
    <WorkbenchSurfaceItem
      active={active}
      className={cn("production-page-list-card", className)}
      {...props}
    >
      <Button
        type="button"
        variant="ghost"
        onClick={onSelect}
        className="production-page-list-card__button"
      >
        {children}
      </Button>
      {footer ? <div className="production-page-list-card__footer">{footer}</div> : null}
    </WorkbenchSurfaceItem>
  );
}

export function ProductionPageCardHeader({
  children,
  aside,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  aside?: ReactNode;
}) {
  return (
    <div className={cn("production-page-card__header", className)} {...props}>
      <div className="production-page-card__header-main">{children}</div>
      {aside ? <div className="production-page-card__aside">{aside}</div> : null}
    </div>
  );
}

export function ProductionPageCardTitle({
  children,
  prefix,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLParagraphElement>, "prefix"> & {
  prefix?: ReactNode;
}) {
  return (
    <p className={cn("production-page-card__title", className)} {...props}>
      {prefix ? <span className="production-page-card__title-prefix">{prefix}</span> : null}
      <span className="production-page-card__title-text">{children}</span>
    </p>
  );
}

export function ProductionPageCardSubtitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("production-page-card__subtitle", className)} {...props} />;
}

export function ProductionPageCardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("production-page-card__description", className)} {...props} />;
}

export function ProductionPageProgressRow({
  value,
  label,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  value: number;
  label?: ReactNode;
}) {
  return (
    <div className={cn("production-page-progress-row", className)} {...props}>
      <Progress value={value} className="production-page-progress-row__bar" />
      <span className="production-page-progress-row__value">{label ?? `${value}%`}</span>
    </div>
  );
}

export function ProductionPageMetaRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-page-meta-row", className)} {...props} />;
}

export function ProductionPageMetaItem({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("production-page-meta-row__item", className)} {...props} />;
}

export function ProductionPageEyebrow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-page-eyebrow", className)} {...props} />;
}

export function ProductionPageFooterAction({ className, ...props }: ButtonProps) {
  return <Button size="sm" className={cn("production-page-footer-action", className)} {...props} />;
}

export function ProductionPageNextActionItem({
  index,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  index: ReactNode;
}) {
  return (
    <WorkbenchListItem className={cn("production-page-next-action", className)} {...props}>
      <AppIconFrame size="sm" className="production-page-next-action__index">
        {index}
      </AppIconFrame>
      <p className="production-page-next-action__text">{children}</p>
    </WorkbenchListItem>
  );
}

export function ProductionPageActivityItem({
  label,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
}) {
  return (
    <div className={cn("production-page-activity-item", className)} {...props}>
      <AppMarkerDot tone="muted" size="sm" className="production-page-activity-item__dot" />
      <div className="production-page-activity-item__body">
        <p className="production-page-activity-item__label">{label}</p>
        <p className="production-page-activity-item__text">{children}</p>
      </div>
    </div>
  );
}

export function ProductionPageDetailGrid({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("production-page-detail-grid", className)} {...props} />;
}

export function ProductionPageBottomGrid({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("production-page-bottom-grid", className)} {...props} />;
}

export function ProductionPageListStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-page-list-stack", className)} {...props} />;
}

export function ProductionPageActivityStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-page-activity-stack", className)} {...props} />;
}

export function ProductionPageAsideActionGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-page-aside-action-grid", className)} {...props} />;
}

export function ProductionPagePreviewTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("production-page-preview__title", className)} {...props} />;
}

export function ProductionPagePreviewDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("production-page-preview__description", className)} {...props} />;
}

export function ProductionPagePreviewProgress({ className, ...props }: ComponentPropsWithoutRef<typeof Progress>) {
  return <Progress className={cn("production-page-preview__progress", className)} {...props} />;
}

export function ProductionPagePreviewMetaStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-page-preview__meta-stack", className)} {...props} />;
}

export function ProductionPagePreviewMetaLine({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("production-page-preview__meta-line", className)} {...props} />;
}

export function ProductionPagePreviewActionSlot({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-page-preview__action-slot", className)} {...props} />;
}

export function ProductionPageAreaCard({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <WorkbenchSurfaceItem asChild className={cn("production-page-area-card", className)} {...props} />
  );
}

export function ProductionPageAreaCardIdentity({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
}) {
  return (
    <div className={cn("production-page-area-card__identity", className)} {...props}>
      {icon ? <AppIconFrame className="production-page-area-card__icon">{icon}</AppIconFrame> : null}
      <div className="production-page-area-card__identity-body">{children}</div>
    </div>
  );
}

export function ProductionPageAreaCardMetric({
  value,
  progress,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  value: ReactNode;
  progress: number;
}) {
  return (
    <div className={cn("production-page-area-card__metric", className)} {...props}>
      <p className="production-page-area-card__metric-value">{value}</p>
      <Progress value={progress} className="production-page-area-card__metric-progress" />
    </div>
  );
}

export function ProductionPageUnitRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-page-unit-row", className)} {...props} />;
}

export function ProductionPageUnitCode({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-page-unit-row__code", className)} {...props} />;
}

export function ProductionPageUnitCodeLine({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("production-page-unit-row__code-line", className)} {...props} />;
}

export function ProductionPageUnitBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-page-unit-row__body", className)} {...props} />;
}

export function ProductionPageUnitTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("production-page-unit-row__title", className)} {...props} />;
}

export function ProductionPageUnitSummary({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("production-page-unit-row__summary", className)} {...props} />;
}

export function ProductionPageUnitText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("production-page-unit-row__text", className)} {...props} />;
}
