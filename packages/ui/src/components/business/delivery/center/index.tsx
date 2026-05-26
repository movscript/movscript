import type { ComponentPropsWithoutRef, HTMLAttributes, ReactNode } from "react";

import { accentBadgeClass, accentTextClass, toneSurfaceClass, toneTextClass, type AccentTone, type SemanticTone } from "../../../../semantic";
import { cn } from "../../../../lib/cn";
import { Badge, Button, Input, Label, NativeSelect, Progress, StatusBadge, type ButtonProps } from "../../../primitives";
import type { IconComponent } from "../../../primitives/types";
import { AppContentLayout, ContentWorkspaceLayout } from "../../../layout";
import { AppEmptyState, AppMediaFrame, AppMetricCard, AppPanel, AppSection, AppSurfaceItem } from "../../app";
import {
  WorkbenchEmptyState,
  WorkbenchEntityCard,
  WorkbenchKeyValue,
  WorkbenchMetric,
  WorkbenchSection,
  WorkbenchStatusBadge,
  WorkbenchSurfaceItem,
} from "../../workbench";

export type ProductionDeliveryCenterMode = "package" | "assembly";

export function ProductionDeliveryCenterPageLayout(props: ComponentPropsWithoutRef<typeof AppContentLayout>) {
  return <AppContentLayout variant="contained" width="xwide" contentClassName="production-delivery-center-page" {...props} />;
}

export function ProductionDeliveryCenterBadge({ className, ...props }: ComponentPropsWithoutRef<typeof Badge>) {
  return <Badge className={cn("production-delivery-center-badge", className)} {...props} />;
}

export function ProductionDeliveryCenterStatusBadge({
  label,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof StatusBadge> & {
  label: ReactNode;
}) {
  return <StatusBadge className={cn("production-delivery-center-status-badge", className)} {...props}>{label}</StatusBadge>;
}

export function ProductionDeliveryCenterHeaderAction({ className, ...props }: ButtonProps) {
  return <Button variant="outline" className={cn("production-delivery-center-header-action", className)} {...props} />;
}

export function ProductionDeliveryCenterMetric(props: ComponentPropsWithoutRef<typeof AppMetricCard>) {
  return <AppMetricCard {...props} />;
}

export function ProductionDeliveryCenterMetricGrid({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("production-delivery-center-metric-grid", className)} {...props} />;
}

export function ProductionDeliveryCenterLayout({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("production-delivery-center-layout", className)} {...props} />;
}

export function ProductionDeliveryCenterSideRail({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <aside className={cn("production-delivery-center-side-rail", className)} {...props} />;
}

export function ProductionDeliveryCenterSection({
  children,
  className,
  bodyClassName,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <AppSection
      className={cn("production-delivery-center-section", className)}
      bodyClassName={cn("production-delivery-center-section__body", bodyClassName)}
      {...props}
    >
      {children}
    </AppSection>
  );
}

export function ProductionDeliveryCenterPanel({
  children,
  className,
  bodyClassName,
  iconClassName,
  iconAccent,
  iconTone,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  icon?: IconComponent;
  iconClassName?: string;
  iconAccent?: AccentTone;
  iconTone?: SemanticTone;
  action?: ReactNode;
  bodyClassName?: string;
}) {
  const resolvedIconClassName = iconAccent
    ? accentTextClass(iconAccent, iconClassName)
    : iconTone
      ? toneTextClass(iconTone, iconClassName)
      : iconClassName;
  return (
    <AppPanel
      className={cn("production-delivery-center-panel", className)}
      bodyClassName={cn("production-delivery-center-panel__body", bodyClassName)}
      iconClassName={resolvedIconClassName}
      {...props}
    >
      {children}
    </AppPanel>
  );
}

export function ProductionDeliveryCenterModeStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-delivery-center-mode-stack", className)} {...props} />;
}

export function ProductionDeliveryCenterModeCard({
  icon: Icon,
  title,
  detail,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon: IconComponent;
  title: ReactNode;
  detail: ReactNode;
}) {
  return (
    <AppSurfaceItem className={cn("production-delivery-center-mode-card", className)} {...props}>
      <div className="production-delivery-center-mode-card__header">
        <Icon size={14} className="production-delivery-center-mode-card__icon" />
        <p className="production-delivery-center-mode-card__title">{title}</p>
      </div>
      <p className="production-delivery-center-mode-card__detail">{detail}</p>
    </AppSurfaceItem>
  );
}

export function ProductionDeliveryCenterTextStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-delivery-center-text-stack", className)} {...props} />;
}

export function ProductionDeliveryCenterTextBlock({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("production-delivery-center-text-block", className)} {...props} />;
}

export function ProductionDeliveryCenterEmptyState(props: ComponentPropsWithoutRef<typeof AppEmptyState>) {
  return <AppEmptyState {...props} />;
}

export function ProductionDeliveryGateIconFrame({
  intent,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  intent: SemanticTone;
}) {
  return (
    <div
      className={cn("production-delivery-gate-icon-frame", toneSurfaceClass(intent), toneTextClass(intent), className)}
      {...props}
    />
  );
}

export function ProductionDeliveryErrorText({
  intent = "danger",
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  intent?: SemanticTone;
}) {
  return <p className={cn("production-delivery-error-text", toneTextClass(intent), className)} {...props} />;
}

export function ProductionDeliveryWorkbenchStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-delivery-workbench-stack", className)} {...props} />;
}

export function ProductionDeliveryWorkbenchLayout({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof ContentWorkspaceLayout>) {
  return <ContentWorkspaceLayout className={cn("production-delivery-workbench-layout", className)} {...props} />;
}

export function ProductionDeliveryWorkbenchMetricGrid({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("production-delivery-workbench-metric-grid", className)} {...props} />;
}

export function ProductionDeliveryWorkbenchSplit({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("production-delivery-workbench-split", className)} {...props} />;
}

export function ProductionDeliveryWorkbenchActionGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-delivery-workbench-action-group", className)} {...props} />;
}

export function ProductionDeliveryWorkbenchBadge({ className, ...props }: ComponentPropsWithoutRef<typeof Badge>) {
  return <Badge className={cn("production-delivery-workbench-badge", className)} {...props} />;
}

export function ProductionDeliveryWorkbenchActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("production-delivery-workbench-action-button", className)} {...props} />;
}

export function ProductionDeliveryWorkbenchSection(props: ComponentPropsWithoutRef<typeof WorkbenchSection>) {
  return <WorkbenchSection {...props} />;
}

export function ProductionDeliveryWorkbenchMetric(props: ComponentPropsWithoutRef<typeof WorkbenchMetric>) {
  return <WorkbenchMetric {...props} />;
}

export function ProductionDeliveryWorkbenchKeyValue(props: ComponentPropsWithoutRef<typeof WorkbenchKeyValue>) {
  return <WorkbenchKeyValue {...props} />;
}

export function ProductionDeliveryWorkbenchStatusBadge(props: ComponentPropsWithoutRef<typeof WorkbenchStatusBadge>) {
  return <WorkbenchStatusBadge {...props} />;
}

export function ProductionDeliveryWorkbenchEmptyState(props: ComponentPropsWithoutRef<typeof WorkbenchEmptyState>) {
  return <WorkbenchEmptyState {...props} />;
}

export function ProductionDeliveryVersionListSummaryGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-delivery-version-list-summary-grid", className)} {...props} />;
}

export function ProductionDeliveryVersionListSection(props: Omit<ComponentPropsWithoutRef<typeof WorkbenchSection>, "bodyClassName">) {
  return <WorkbenchSection bodyClassName="production-delivery-version-list-section__body" {...props} />;
}

export function ProductionDeliveryVersionListViewport({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-delivery-version-list-viewport", className)} {...props} />;
}

export function ProductionDeliveryVersionListStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-delivery-version-list-stack", className)} {...props} />;
}

export function ProductionDeliveryVersionCard(props: ComponentPropsWithoutRef<typeof WorkbenchEntityCard>) {
  return <WorkbenchEntityCard {...props} />;
}

export function ProductionDeliveryScopeSelect({
  label,
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof NativeSelect> & {
  label: ReactNode;
}) {
  return (
    <label className={cn("production-delivery-scope-select", className)}>
      <span>{label}</span>
      <NativeSelect className="production-delivery-scope-select__control" {...props}>
        {children}
      </NativeSelect>
    </label>
  );
}

export function ProductionDeliveryVersionDetailSection({
  bodyClassName,
  ...props
}: ComponentPropsWithoutRef<typeof WorkbenchSection>) {
  return (
    <WorkbenchSection
      bodyClassName={cn("production-delivery-version-detail-section__body", bodyClassName)}
      {...props}
    />
  );
}

export function ProductionDeliveryVersionSummaryMetrics({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-delivery-version-summary-metrics", className)} {...props} />;
}

export function ProductionDeliveryVersionLockSummary({
  label,
  value,
  children,
}: {
  label: ReactNode;
  value: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="production-delivery-version-lock-summary">
      <div className="production-delivery-version-lock-summary__header">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="production-delivery-version-lock-summary__grid">{children}</div>
    </div>
  );
}

export function ProductionDeliveryGateCheckStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-delivery-gate-check-stack", className)} {...props} />;
}

export function ProductionDeliveryGateCheckItem({
  icon,
  intent,
  title,
  count,
  description,
}: {
  icon: ReactNode;
  intent: SemanticTone;
  title: ReactNode;
  count: ReactNode;
  description: ReactNode;
}) {
  return (
    <WorkbenchSurfaceItem className="production-delivery-gate-check-item">
      <ProductionDeliveryGateIconFrame intent={intent}>{icon}</ProductionDeliveryGateIconFrame>
      <div className="production-delivery-gate-check-item__body">
        <div className="production-delivery-gate-check-item__header">
          <p className="production-delivery-gate-check-item__title">{title}</p>
          <span className="production-delivery-gate-check-item__count">{count}</span>
        </div>
        <p className="production-delivery-gate-check-item__description">{description}</p>
      </div>
    </WorkbenchSurfaceItem>
  );
}

export function ProductionDeliveryItemEditorStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-delivery-item-editor-stack", className)} {...props} />;
}

export function ProductionDeliveryItemEditorGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-delivery-item-editor-grid", className)} {...props} />;
}

export function ProductionDeliveryField({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="production-delivery-field">
      <Label className="production-delivery-field__label">{label}</Label>
      {children}
    </div>
  );
}

export function ProductionDeliveryInput({ className, ...props }: ComponentPropsWithoutRef<typeof Input>) {
  return <Input className={cn("production-delivery-input", className)} {...props} />;
}

export function ProductionDeliveryNativeSelect({ className, ...props }: ComponentPropsWithoutRef<typeof NativeSelect>) {
  return <NativeSelect className={cn("production-delivery-native-select", className)} {...props} />;
}

export function ProductionDeliveryExportRecordStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-delivery-export-record-stack", className)} {...props} />;
}

export function ProductionDeliveryExportRecordItem({
  title,
  status,
  error,
}: {
  title: ReactNode;
  status: ReactNode;
  error?: ReactNode;
}) {
  return (
    <WorkbenchSurfaceItem className="production-delivery-export-record-item">
      <div className="production-delivery-export-record-item__header">
        <p className="production-delivery-export-record-item__title">{title}</p>
        {status}
      </div>
      {error ? <ProductionDeliveryErrorText>{error}</ProductionDeliveryErrorText> : null}
    </WorkbenchSurfaceItem>
  );
}

export function ProductionDeliveryResourceAdoptionShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-delivery-resource-adoption-shell", className)} {...props} />;
}

export function ProductionDeliveryResourceAdoptionField({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="production-delivery-resource-adoption-field">
      <Label className="production-delivery-resource-adoption-field__label">{label}</Label>
      {children}
    </div>
  );
}

export function ProductionDeliveryResourcePreviewFrame({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-delivery-resource-preview-frame", className)} {...props} />;
}

export function ProductionDeliveryResourcePlaceholder({ children }: { children: ReactNode }) {
  return <AppMediaFrame variant="placeholder">{children}</AppMediaFrame>;
}

export function ProductionDeliveryVersionCardMeta({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("production-delivery-version-card-meta", className)} {...props} />;
}

export function ProductionDeliveryCenterRow({
  mode,
  title,
  description,
  versionCount,
  itemCount,
  status,
  exportStatus,
  readiness,
  action,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  mode: ProductionDeliveryCenterMode;
  title: ReactNode;
  description: ReactNode;
  versionCount: ReactNode;
  itemCount: ReactNode;
  status: ReactNode;
  exportStatus: ReactNode;
  readiness: number;
  action: ReactNode;
}) {
  return (
    <article className={cn("production-delivery-center-row", className)} {...props}>
      <div className="production-delivery-center-row__identity">
        <div className="production-delivery-center-row__title-line">
          <p className="production-delivery-center-row__title">{title}</p>
          <Badge className={cn("production-delivery-center-row__mode", accentBadgeClass(mode === "assembly" ? "sky" : "lime"))}>
            {mode === "assembly" ? "轻量成片" : "素材包"}
          </Badge>
        </div>
        <p className="production-delivery-center-row__description">{description}</p>
      </div>
      <ProductionDeliveryCenterRowMetric value={versionCount} label="交付版本" />
      <ProductionDeliveryCenterRowMetric value={itemCount} label="时间线项" />
      <div className="production-delivery-center-row__status">
        <div className="production-delivery-center-row__status-badge">{status}</div>
        <p className="production-delivery-center-row__status-detail">{exportStatus}</p>
      </div>
      <div className="production-delivery-center-row__readiness-action">
        <div className="production-delivery-center-row__readiness">
          <div className="production-delivery-center-row__readiness-label">
            <span>就绪</span>
            <span>{readiness}%</span>
          </div>
          <Progress value={readiness} className="production-delivery-center-row__readiness-bar" />
        </div>
        <Button size="sm" className="production-delivery-center-row__action" asChild>
          {action}
        </Button>
      </div>
    </article>
  );
}

function ProductionDeliveryCenterRowMetric({
  value,
  label,
}: {
  value: ReactNode;
  label: ReactNode;
}) {
  return (
    <div className="production-delivery-center-row__metric">
      <p className="production-delivery-center-row__metric-value">{value}</p>
      <p className="production-delivery-center-row__metric-label">{label}</p>
    </div>
  );
}
