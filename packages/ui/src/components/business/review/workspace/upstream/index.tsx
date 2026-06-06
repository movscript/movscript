import type { HTMLAttributes, ReactNode } from "react";

import { toneSurfaceClass, type SemanticTone } from "../../../../../semantic";
import { cn } from "../../../../../lib/cn";
import { AppInlineMeta, AppKeyValue, AppPanel, AppSection, AppSurfaceItem, AppTextEmptyState } from "../../../app";
import { Badge, Button } from "../../../../primitives";
import type { IconComponent } from "../../types";

export type ReviewWorkspaceUpstreamImpact = "neutral" | "destructive";

export interface ReviewWorkspaceUpstreamMetric {
  label: ReactNode;
  value: ReactNode;
  impact?: ReviewWorkspaceUpstreamImpact;
}

export interface ReviewWorkspaceUpstreamEntry {
  key: string;
  title: ReactNode;
  detail: ReactNode;
  target: ReactNode;
  impact?: ReviewWorkspaceUpstreamImpact;
}

export function ReviewWorkspaceUpstreamSection({
  icon,
  eyebrow = "上游草案审阅",
  title,
  description,
  loaded,
  actions,
  children,
  empty,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  icon?: IconComponent;
  eyebrow?: string;
  title: string;
  description: string;
  loaded: boolean;
  actions?: ReactNode;
  children?: ReactNode;
  empty: ReactNode;
}) {
  return (
    <AppSection
      icon={icon}
      eyebrow={eyebrow}
      title={title}
      description={description}
      action={(
        <div className="review-workspace-upstream-section__actions">
          <Badge variant={loaded ? "soft" : "outline"} className="review-workspace-upstream-section__status">
            {loaded ? "已加载" : "未加载"}
          </Badge>
          {actions}
        </div>
      )}
      bodyClassName="review-workspace-upstream-section__body"
      className={className}
    >
      {loaded ? children : <AppTextEmptyState>{empty}</AppTextEmptyState>}
    </AppSection>
  );
}

export function ReviewWorkspaceUpstreamActionButton({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Button asChild size="sm" variant="outline" className="review-workspace-upstream-action-button">
      {children}
    </Button>
  );
}

export function ReviewWorkspaceUpstreamMetricGrid({
  metrics,
}: {
  metrics: ReviewWorkspaceUpstreamMetric[];
}) {
  return (
    <div className="review-workspace-upstream-metric-grid">
      {metrics.map((metric, index) => (
        <AppKeyValue
          key={index}
          label={metric.label}
          value={metric.value}
          strong
          className={metric.impact ? toneSurfaceClass(reviewWorkspaceUpstreamImpactTone(metric.impact)) : undefined}
        />
      ))}
    </div>
  );
}

export function ReviewWorkspaceUpstreamSummary({
  children,
}: {
  children: ReactNode;
}) {
  return <p className="review-workspace-upstream-summary">{children}</p>;
}

export function ReviewWorkspaceUpstreamPreviewGrid({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="review-workspace-upstream-preview-grid">{children}</div>;
}

export function ReviewWorkspaceUpstreamEntryPreview({
  title,
  empty,
  entries,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  empty: ReactNode;
  entries: ReviewWorkspaceUpstreamEntry[];
}) {
  return (
    <AppPanel title={title} bodyClassName="review-workspace-upstream-entry-preview__body" className={className}>
      {entries.slice(0, 4).map((entry) => (
        <AppSurfaceItem
          key={entry.key}
          density="compact"
          className={cn("review-workspace-upstream-entry", entry.impact ? toneSurfaceClass(reviewWorkspaceUpstreamImpactTone(entry.impact)) : undefined)}
        >
          <div className="review-workspace-upstream-entry__header">
            <span className="review-workspace-upstream-entry__title">{entry.title}</span>
            <AppInlineMeta className="review-workspace-upstream-entry__target">{entry.target}</AppInlineMeta>
          </div>
          <p className="review-workspace-upstream-entry__detail">{entry.detail}</p>
        </AppSurfaceItem>
      ))}
      {!entries.length ? <p className="review-workspace-upstream-entry-preview__empty">{empty}</p> : null}
    </AppPanel>
  );
}

function reviewWorkspaceUpstreamImpactTone(impact: ReviewWorkspaceUpstreamImpact): SemanticTone {
  if (impact === "destructive") return "danger";
  return "neutral";
}
