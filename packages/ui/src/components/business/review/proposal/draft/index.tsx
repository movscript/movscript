import type { HTMLAttributes, ReactNode } from "react";

import { toneTextClass, type SemanticTone } from "../../../../../semantic";
import { ArrowRightIcon } from "../../../../primitives";
import { cn } from "../../../../../lib/cn";
import { AppInlineMeta, AppPanel } from "../../../app";
import { ReviewCallout } from "../../callout";

export type ReviewProposalFieldDiffChange = "added" | "deleted" | "modified" | "unchanged";

export function ReviewProposalDraftList({
  children,
  className,
  scroll = false,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  scroll?: boolean;
}) {
  return <div className={cn("review-proposal-draft-list", scroll && "review-proposal-draft-list--scroll", className)}>{children}</div>;
}

export function ReviewProposalDraftPanel({
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
      action={badges ? <div className="review-proposal-draft-panel__badges">{badges}</div> : undefined}
      className={className}
      bodyClassName={cn("review-proposal-draft-panel__body", bodyClassName)}
    >
      {meta ? <p className="review-proposal-draft-panel__meta">{meta}</p> : null}
      {children}
    </AppPanel>
  );
}

export function ReviewProposalSummaryCallout({
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
      <div className="review-proposal-summary-callout__main">
        <p className="review-proposal-summary-callout__summary">{summary}</p>
        {badges ? <div className="review-proposal-summary-callout__badges">{badges}</div> : null}
      </div>
      {detail || actions ? (
        <div className="review-proposal-summary-callout__footer">
          {detail ? <p className="review-proposal-summary-callout__detail">{detail}</p> : null}
          {actions ? <div className="review-proposal-summary-callout__actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </ReviewCallout>
  );
}

export function ReviewProposalEntryHeader({
  title,
  badges,
  actions,
}: {
  title: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="review-proposal-entry-header">
      <div className="review-proposal-entry-header__main">
        <div className="review-proposal-entry-header__title-row">
          <span className="review-proposal-entry-header__title">{title}</span>
          {badges}
        </div>
      </div>
      {actions ? <div className="review-proposal-entry-header__actions">{actions}</div> : null}
    </div>
  );
}

export function ReviewProposalFieldDiffList({
  children,
  columns = 1,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  columns?: 1 | 2;
}) {
  return <div className={cn("review-proposal-field-diff-list", columns === 2 && "review-proposal-field-diff-list--2", className)}>{children}</div>;
}

export function ReviewProposalFieldDiffRow({
  label,
  before,
  after,
  change = "unchanged",
}: {
  label: ReactNode;
  before?: ReactNode;
  after?: ReactNode;
  change?: ReviewProposalFieldDiffChange;
}) {
  const tone = reviewProposalFieldDiffTone(change);
  return (
    <div className="review-proposal-field-diff-row">
      <AppInlineMeta className="review-proposal-field-diff-row__label">{label}</AppInlineMeta>
      <span className={cn("review-proposal-field-diff-row__before", before ? "review-proposal-field-diff-row__before--changed" : undefined)}>
        {before || "新增"}
      </span>
      <ArrowRightIcon size={10} className="review-proposal-field-diff-row__arrow" />
      <span className={cn("review-proposal-field-diff-row__after", tone !== "neutral" ? toneTextClass(tone) : undefined)}>
        {after || "未填写"}
      </span>
    </div>
  );
}

function reviewProposalFieldDiffTone(change: ReviewProposalFieldDiffChange): SemanticTone {
  if (change === "added") return "success";
  if (change === "deleted") return "danger";
  if (change === "modified") return "info";
  return "neutral";
}
