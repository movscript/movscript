import type { HTMLAttributes, ReactNode } from "react";

import { toneSurfaceClass, type SemanticTone } from "../../../../../semantic";
import { cn } from "../../../../../lib/cn";
import { AppInlineMeta, AppKeyValue, AppPanel, AppSection, AppSurfaceItem, AppTextEmptyState } from "../../../app";
import { Badge, Button } from "../../../../primitives";
import type { IconComponent } from "../../types";

export type ReviewProposalUpstreamImpact = "neutral" | "destructive";

export interface ReviewProposalUpstreamMetric {
  label: ReactNode;
  value: ReactNode;
  impact?: ReviewProposalUpstreamImpact;
}

export interface ReviewProposalUpstreamEntry {
  key: string;
  title: ReactNode;
  detail: ReactNode;
  target: ReactNode;
  impact?: ReviewProposalUpstreamImpact;
}

export function ReviewProposalUpstreamSection({
  icon,
  eyebrow = "上游提案审阅",
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
        <div className="review-proposal-upstream-section__actions">
          <Badge variant={loaded ? "soft" : "outline"} className="review-proposal-upstream-section__status">
            {loaded ? "已加载" : "未加载"}
          </Badge>
          {actions}
        </div>
      )}
      bodyClassName="review-proposal-upstream-section__body"
      className={className}
    >
      {loaded ? children : <AppTextEmptyState>{empty}</AppTextEmptyState>}
    </AppSection>
  );
}

export function ReviewProposalUpstreamActionButton({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Button asChild size="sm" variant="outline" className="review-proposal-upstream-action-button">
      {children}
    </Button>
  );
}

export function ReviewProposalUpstreamMetricGrid({
  metrics,
}: {
  metrics: ReviewProposalUpstreamMetric[];
}) {
  return (
    <div className="review-proposal-upstream-metric-grid">
      {metrics.map((metric, index) => (
        <AppKeyValue
          key={index}
          label={metric.label}
          value={metric.value}
          strong
          className={metric.impact ? toneSurfaceClass(reviewProposalUpstreamImpactTone(metric.impact)) : undefined}
        />
      ))}
    </div>
  );
}

export function ReviewProposalUpstreamSummary({
  children,
}: {
  children: ReactNode;
}) {
  return <p className="review-proposal-upstream-summary">{children}</p>;
}

export function ReviewProposalUpstreamPreviewGrid({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="review-proposal-upstream-preview-grid">{children}</div>;
}

export function ReviewProposalUpstreamEntryPreview({
  title,
  empty,
  entries,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  empty: ReactNode;
  entries: ReviewProposalUpstreamEntry[];
}) {
  return (
    <AppPanel title={title} bodyClassName="review-proposal-upstream-entry-preview__body" className={className}>
      {entries.slice(0, 4).map((entry) => (
        <AppSurfaceItem
          key={entry.key}
          density="compact"
          className={cn("review-proposal-upstream-entry", entry.impact ? toneSurfaceClass(reviewProposalUpstreamImpactTone(entry.impact)) : undefined)}
        >
          <div className="review-proposal-upstream-entry__header">
            <span className="review-proposal-upstream-entry__title">{entry.title}</span>
            <AppInlineMeta className="review-proposal-upstream-entry__target">{entry.target}</AppInlineMeta>
          </div>
          <p className="review-proposal-upstream-entry__detail">{entry.detail}</p>
        </AppSurfaceItem>
      ))}
      {!entries.length ? <p className="review-proposal-upstream-entry-preview__empty">{empty}</p> : null}
    </AppPanel>
  );
}

function reviewProposalUpstreamImpactTone(impact: ReviewProposalUpstreamImpact): SemanticTone {
  if (impact === "destructive") return "danger";
  return "neutral";
}
