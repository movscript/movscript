import type { ComponentProps, HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { AppEmptyState, AppStateMessage, AppTextEmptyState } from "../../app";
import { ReviewCallout, type ReviewTone } from "../../review";
import { Badge, Button, StatusBadge, type ButtonProps, type StatusBadgeProps } from "../../../primitives";

export type ProjectProposalReviewEntryChange = "added" | "deleted" | "modified" | "unchanged";
export type ProjectProposalReviewInlineSize = "tiny" | "micro";

export function ProjectProposalReviewLoadingState({
  className,
  ...props
}: ComponentProps<typeof AppStateMessage>) {
  return <AppStateMessage className={cn("project-proposal-review-loading", className)} {...props} />;
}

export function ProjectProposalReviewEmptyText({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <AppTextEmptyState className={cn("project-proposal-review-empty-text", className)} {...props} />;
}

export function ProjectProposalReviewEmptyBlock({
  className,
  ...props
}: ComponentProps<typeof AppEmptyState>) {
  return <AppEmptyState className={cn("project-proposal-review-empty-block", className)} {...props} />;
}

export function ProjectProposalReviewCallout({
  className,
  ...props
}: ComponentProps<typeof ReviewCallout>) {
  return <ReviewCallout className={cn("project-proposal-review-callout", className)} {...props} />;
}

export function ProjectProposalReviewEntryCallout({
  change,
  className,
  ...props
}: Omit<ComponentProps<typeof ReviewCallout>, "tone"> & {
  change: ProjectProposalReviewEntryChange;
}) {
  return (
    <ReviewCallout
      tone={projectProposalReviewChangeTone(change)}
      compact
      className={cn("project-proposal-review-entry-callout", className)}
      {...props}
    />
  );
}

export function ProjectProposalReviewNoteList({
  notes,
  limit = 4,
  itemKeyPrefix = "project-proposal-review-note",
}: {
  notes: ReactNode[];
  limit?: number;
  itemKeyPrefix?: string;
}) {
  return (
    <>
      {notes.slice(0, limit).map((note, index) => (
        <p key={`${itemKeyPrefix}-${index}`} className="project-proposal-review-note">{note}</p>
      ))}
    </>
  );
}

export function ProjectProposalReviewBadge({
  size = "tiny",
  className,
  ...props
}: ComponentProps<typeof Badge> & {
  size?: ProjectProposalReviewInlineSize;
}) {
  return (
    <Badge
      className={cn("project-proposal-review-badge", `project-proposal-review-badge--${size}`, className)}
      {...props}
    />
  );
}

export function ProjectProposalReviewStatusBadge({
  size = "tiny",
  className,
  ...props
}: StatusBadgeProps & {
  size?: ProjectProposalReviewInlineSize;
}) {
  return (
    <StatusBadge
      className={cn("project-proposal-review-status-badge", `project-proposal-review-status-badge--${size}`, className)}
      {...props}
    />
  );
}

export function ProjectProposalReviewActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("project-proposal-review-action-button", className)} {...props} />;
}

export function ProjectProposalReviewDetailText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("project-proposal-review-detail-text", className)} {...props} />;
}

function projectProposalReviewChangeTone(change: ProjectProposalReviewEntryChange): ReviewTone {
  if (change === "deleted") return "danger";
  return "neutral";
}
