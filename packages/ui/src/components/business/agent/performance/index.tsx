import type { ComponentProps, HTMLAttributes, ReactNode, SVGAttributes } from "react";

import { cn } from "../../../../lib/cn";
import { toneSurfaceClass, toneTextClass } from "../../../../semantic";
import type { UiSemanticIntent } from "../../../../style-system";
import { AppProgressBar, type AppProgressBarProps } from "../../app/display";
import { AppTextEmptyState } from "../../app/state";
import { Button, StatusBadge, type ButtonProps, type StatusBadgeProps } from "../../../primitives";
import type { IconComponent } from "../../../primitives/types";
import { AgentDataBlock } from "../run";
import { AgentSurfaceBlock, type AgentSurfaceBlockProps } from "../surface-block";

export function AgentPerformanceHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-performance-header", className)} {...props} />;
}

export function AgentPerformanceHeaderCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-performance-header__copy", className)} {...props} />;
}

export function AgentPerformanceHeaderTitleRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-performance-header__title-row", className)} {...props} />;
}

export function AgentPerformanceHeaderTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn("agent-performance-header__title", className)} {...props} />;
}

export function AgentPerformanceHeaderDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-performance-header__description", className)} {...props} />;
}

export function AgentPerformanceHeaderActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-performance-header__actions", className)} {...props} />;
}

export function AgentPerformanceActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("agent-performance-action-button", className)} {...props} />;
}

export function AgentPerformanceStatusBadge({ className, ...props }: StatusBadgeProps) {
  return <StatusBadge className={cn("agent-performance-status-badge", className)} {...props} />;
}

export function AgentPerformanceIcon({
  icon: Icon,
  className,
  ...props
}: {
  icon: IconComponent;
  className?: string;
} & Omit<ComponentProps<IconComponent>, "className">) {
  return <Icon className={cn("agent-performance-icon", className)} {...props} />;
}

export function AgentPerformanceStatGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-performance-stat-grid", className)} {...props} />;
}

export function AgentPerformanceThreeColumnGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-performance-three-column-grid", className)} {...props} />;
}

export function AgentPerformanceMainGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-performance-main-grid", className)} {...props} />;
}

export function AgentPerformanceTwoColumnGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-performance-two-column-grid", className)} {...props} />;
}

export function AgentPerformanceTimelineGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-performance-timeline-grid", className)} {...props} />;
}

export function AgentPerformanceScrollList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-performance-scroll-list", className)} {...props} />;
}

export function AgentPerformanceStack({
  density = "regular",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  density?: "regular" | "compact";
}) {
  return <div data-density={density} className={cn("agent-performance-stack", className)} {...props} />;
}

export function AgentPerformanceSection({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-performance-section", className)} {...props} />;
}

export function AgentPerformanceSectionTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-performance-section__title", className)} {...props} />;
}

export function AgentPerformanceEmptyState({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <AppTextEmptyState className={cn("agent-performance-empty", className)} {...props}>
      {children}
    </AppTextEmptyState>
  );
}

export interface AgentPerformanceOperationButtonProps extends ButtonProps {
  active?: boolean;
}

export function AgentPerformanceOperationButton({
  active = false,
  children,
  className,
  ...props
}: AgentPerformanceOperationButtonProps) {
  return (
    <AgentSurfaceBlock asChild variant="subtle">
      <Button
        type="button"
        variant="ghost"
        data-active={active ? "true" : undefined}
        className={cn("agent-performance-operation-button", className)}
        {...props}
      >
        {children}
      </Button>
    </AgentSurfaceBlock>
  );
}

export function AgentPerformanceDurationText({
  tone = "neutral",
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "warning";
}) {
  return (
    <span
      className={cn(
        "agent-performance-duration-text",
        tone === "warning" && "agent-performance-duration-text--warning",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function AgentPerformanceSurface({
  className,
  ...props
}: AgentSurfaceBlockProps) {
  return <AgentSurfaceBlock className={cn("agent-performance-surface", className)} {...props} />;
}

export function AgentPerformanceListItem({
  title,
  meta,
  badge,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <AgentSurfaceBlock className="agent-performance-list-item">
      <div className="agent-performance-list-item__header">
        <div className="agent-performance-list-item__copy">
          <p className="agent-performance-list-item__title">{title}</p>
          {meta ? <p className="agent-performance-list-item__meta">{meta}</p> : null}
        </div>
        {badge}
      </div>
      {children}
    </AgentSurfaceBlock>
  );
}

export function AgentPerformanceOperationButtonContent({
  title,
  meta,
  badge,
}: {
  title: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <>
      <div className="agent-performance-list-item__header">
        <div className="agent-performance-list-item__copy">
          <p className="agent-performance-list-item__title">{title}</p>
          {meta ? <p className="agent-performance-list-item__meta">{meta}</p> : null}
        </div>
        {badge}
      </div>
    </>
  );
}

export function AgentPerformanceTrendPoint({
  tone = "ready",
  className,
  ...props
}: SVGAttributes<SVGCircleElement> & {
  tone?: "ready" | "warning";
}) {
  return (
    <circle
      className={cn("agent-performance-trend-point", tone === "warning" && "agent-performance-trend-point--warning", className)}
      {...props}
    />
  );
}

export function AgentPerformanceTrendValue({
  tone = "ready",
  children,
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  tone?: "ready" | "warning";
}) {
  return (
    <p className={cn("agent-performance-trend-value", tone === "warning" && "agent-performance-trend-value--warning", className)} {...props}>
      {children}
    </p>
  );
}

export function AgentPerformanceTrendFrame({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <AgentSurfaceBlock className={cn("agent-performance-trend-frame", className)} {...props} />
  );
}

export function AgentPerformanceTrendSvg({ className, ...props }: SVGAttributes<SVGSVGElement>) {
  return <svg className={cn("agent-performance-trend-svg", className)} {...props} />;
}

export function AgentPerformanceTrendBaseline(props: SVGAttributes<SVGLineElement>) {
  return <line className="agent-performance-trend-baseline" {...props} />;
}

export function AgentPerformanceTrendPath(props: SVGAttributes<SVGPathElement>) {
  return <path className="agent-performance-trend-path" {...props} />;
}

export function AgentPerformanceTrendSampleGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-performance-trend-sample-grid", className)} {...props} />;
}

export function AgentPerformanceTrendSample({
  label,
  value,
  tone = "ready",
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: "ready" | "warning";
}) {
  return (
    <AgentDataBlock className="agent-performance-trend-sample">
      <p className="agent-performance-trend-sample__label">{label}</p>
      <AgentPerformanceTrendValue tone={tone}>{value}</AgentPerformanceTrendValue>
    </AgentDataBlock>
  );
}

export function AgentPerformanceProgressBar(props: AppProgressBarProps) {
  return <AppProgressBar {...props} />;
}

export function AgentPerformanceBarList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-performance-bar-list", className)} {...props} />;
}

export function AgentPerformanceBarRow({
  label,
  value,
  children,
}: {
  label: ReactNode;
  value: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="agent-performance-bar-row">
      <div className="agent-performance-bar-row__header">
        <span className="agent-performance-bar-row__label">{label}</span>
        <span className="agent-performance-bar-row__value">{value}</span>
      </div>
      {children}
    </div>
  );
}

export function AgentPerformancePhaseRow({
  active = false,
  time,
  title,
  detail,
  duration,
}: {
  active?: boolean;
  time: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  duration: ReactNode;
}) {
  return (
    <div className={cn("agent-performance-phase-row", active && "agent-performance-phase-row--active")}>
      <span className="agent-performance-phase-row__time">{time}</span>
      <div className="agent-performance-phase-row__copy">
        <p className="agent-performance-phase-row__title">{title}</p>
        {detail ? <p className="agent-performance-phase-row__detail">{detail}</p> : null}
      </div>
      <span className="agent-performance-phase-row__duration">{duration}</span>
    </div>
  );
}

export function AgentPerformanceStatCard({
  title,
  value,
  detail,
  icon,
  tone,
}: {
  title: ReactNode;
  value: ReactNode;
  detail: ReactNode;
  icon: ReactNode;
  tone: "ready" | "warning";
}) {
  const semanticTone = tone === "warning" ? "warning" : "success";
  return (
    <AgentSurfaceBlock variant="card" className="agent-performance-stat-card">
      <div className="agent-performance-stat-card__header">
        <span className="agent-performance-stat-card__title">{title}</span>
        <span className={cn("agent-performance-stat-card__icon", toneSurfaceClass(semanticTone), toneTextClass(semanticTone))}>
          {icon}
        </span>
      </div>
      <p className="agent-performance-stat-card__value">{value}</p>
      <p className="agent-performance-stat-card__detail">{detail}</p>
    </AgentSurfaceBlock>
  );
}

export function AgentPerformancePanel({
  title,
  icon,
  children,
}: {
  title: ReactNode;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <AgentSurfaceBlock asChild variant="card">
      <section className="agent-performance-panel">
        <header className="agent-performance-panel__header">
          <span className="agent-performance-panel__icon">{icon}</span>
          <h2 className="agent-performance-panel__title">{title}</h2>
        </header>
        <div className="agent-performance-panel__body">{children}</div>
      </section>
    </AgentSurfaceBlock>
  );
}

export function AgentPerformanceMetricTable({
  headers,
  rows,
  empty,
}: {
  headers: ReactNode[];
  rows: Array<{ id: string; cells: ReactNode[] }>;
  empty: ReactNode;
}) {
  return (
    <AgentSurfaceBlock className="agent-performance-metric-table">
      <table>
        <thead>
          <tr>
            {headers.map((header, index) => <th key={index}>{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length}>{empty}</td>
            </tr>
          ) : rows.map((row) => (
            <tr key={row.id}>
              {row.cells.map((cell, index) => <td key={index}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </AgentSurfaceBlock>
  );
}

export function AgentPerformanceLogItem({
  badge,
  time,
  message,
}: {
  badge: ReactNode;
  time: ReactNode;
  message: ReactNode;
}) {
  return (
    <AgentSurfaceBlock className="agent-performance-log-item">
      <div className="agent-performance-log-item__header">
        {badge}
        <span className="agent-performance-log-item__time">{time}</span>
      </div>
      <p className="agent-performance-log-item__message">{message}</p>
    </AgentSurfaceBlock>
  );
}

export function AgentPerformancePhaseGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-performance-phase-grid", className)} {...props} />;
}

export function AgentPerformancePhaseStat({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <AgentDataBlock className="agent-performance-phase-stat">
      <p className="agent-performance-phase-stat__label">{label}</p>
      <p className="agent-performance-phase-stat__value">{value}</p>
    </AgentDataBlock>
  );
}

export function AgentPerformanceSlowItem({
  badge,
  duration,
  title,
  subtitle,
}: {
  badge: ReactNode;
  duration: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
}) {
  return (
    <AgentSurfaceBlock className="agent-performance-slow-item">
      <div className="agent-performance-slow-item__header">
        {badge}
        <span className="agent-performance-slow-item__duration">{duration}</span>
      </div>
      <p className="agent-performance-slow-item__title">{title}</p>
      <p className="agent-performance-slow-item__subtitle">{subtitle}</p>
    </AgentSurfaceBlock>
  );
}

export function AgentPerformanceTimelineDetail({ className, ...props }: AgentSurfaceBlockProps) {
  return <AgentSurfaceBlock className={cn("agent-performance-timeline-detail", className)} {...props} />;
}

export function AgentPerformanceTimelineHeader({
  title,
  detail,
  badge,
}: {
  title: ReactNode;
  detail: ReactNode;
  badge: ReactNode;
}) {
  return (
    <div className="agent-performance-timeline-detail__header">
      <div>
        <p className="agent-performance-timeline-detail__title">{title}</p>
        <p className="agent-performance-timeline-detail__meta">{detail}</p>
      </div>
      {badge}
    </div>
  );
}

export function AgentPerformanceTimelineBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-performance-timeline-detail__body", className)} {...props} />;
}

export type AgentPerformanceProgressTone = "brand" | UiSemanticIntent;
