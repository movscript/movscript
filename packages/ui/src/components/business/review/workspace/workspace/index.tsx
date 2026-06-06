import type { HTMLAttributes, ReactNode } from "react";

import { toneTextClass, type SemanticTone } from "../../../../../semantic";
import { ArrowRightIcon } from "../../../../primitives";
import { cn } from "../../../../../lib/cn";
import { AppInlineMeta, AppPanel } from "../../../app";
import { ReviewCallout } from "../../callout";

export type ReviewWorkspaceFieldDiffChange = "added" | "deleted" | "modified" | "unchanged";

export function ReviewWorkspaceArtifactList({
  children,
  className,
  scroll = false,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  scroll?: boolean;
}) {
  return <div className={cn("review-workspace-workspace-list", scroll && "review-workspace-workspace-list--scroll", className)}>{children}</div>;
}

export function ReviewWorkspaceArtifactPanel({
  title,
  meta,
  badges,
  children,
  className,
  bodyClassName,
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  meta?: ReactNode;
  badges?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <AppPanel
      title={title}
      action={badges ? <div className="review-workspace-workspace-panel__badges">{badges}</div> : undefined}
      className={className}
      bodyClassName={cn("review-workspace-workspace-panel__body", bodyClassName)}
    >
      {meta ? <p className="review-workspace-workspace-panel__meta">{meta}</p> : null}
      {children}
    </AppPanel>
  );
}

export const ReviewWorkspaceWorkspaceList = ReviewWorkspaceArtifactList;
export const ReviewWorkspaceWorkspacePanel = ReviewWorkspaceArtifactPanel;

export function ReviewWorkspaceSummaryCallout({
  title,
  summary,
  badges,
  detail,
  actions,
  children,
}: {
  title?: string;
  summary: ReactNode;
  badges?: ReactNode;
  detail?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <ReviewCallout tone="info" compact title={title}>
      <div className="review-workspace-summary-callout__main">
        <p className="review-workspace-summary-callout__summary">{summary}</p>
        {badges ? <div className="review-workspace-summary-callout__badges">{badges}</div> : null}
      </div>
      {detail || actions ? (
        <div className="review-workspace-summary-callout__footer">
          {detail ? <p className="review-workspace-summary-callout__detail">{detail}</p> : null}
          {actions ? <div className="review-workspace-summary-callout__actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </ReviewCallout>
  );
}

export function ReviewWorkspaceEntryHeader({
  title,
  badges,
  actions,
}: {
  title: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="review-workspace-entry-header">
      <div className="review-workspace-entry-header__main">
        <div className="review-workspace-entry-header__title-row">
          <span className="review-workspace-entry-header__title">{title}</span>
          {badges}
        </div>
      </div>
      {actions ? <div className="review-workspace-entry-header__actions">{actions}</div> : null}
    </div>
  );
}

export function ReviewWorkspaceFieldDiffList({
  children,
  columns = 1,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  columns?: 1 | 2;
}) {
  return <div className={cn("review-workspace-field-diff-list", columns === 2 && "review-workspace-field-diff-list--2", className)}>{children}</div>;
}

export function ReviewWorkspaceFieldDiffRow({
  label,
  before,
  after,
  change = "unchanged",
}: {
  label: ReactNode;
  before?: ReactNode;
  after?: ReactNode;
  change?: ReviewWorkspaceFieldDiffChange;
}) {
  const tone = reviewWorkspaceFieldDiffTone(change);
  return (
    <div className="review-workspace-field-diff-row">
      <AppInlineMeta className="review-workspace-field-diff-row__label">{label}</AppInlineMeta>
      <span className={cn("review-workspace-field-diff-row__before", before ? "review-workspace-field-diff-row__before--changed" : undefined)}>
        {before || "新增"}
      </span>
      <ArrowRightIcon size={10} className="review-workspace-field-diff-row__arrow" />
      <span className={cn("review-workspace-field-diff-row__after", tone !== "neutral" ? toneTextClass(tone) : undefined)}>
        {after || "未填写"}
      </span>
    </div>
  );
}

function reviewWorkspaceFieldDiffTone(change: ReviewWorkspaceFieldDiffChange): SemanticTone {
  if (change === "added") return "success";
  if (change === "deleted") return "danger";
  if (change === "modified") return "info";
  return "neutral";
}
