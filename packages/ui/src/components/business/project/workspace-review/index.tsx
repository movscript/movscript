import type { ComponentProps, HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { AppEmptyState, AppStateMessage, AppTextEmptyState } from "../../app";
import { ReviewCallout, type ReviewTone } from "../../review";
import { Badge, Button, StatusBadge, type ButtonProps, type StatusBadgeProps } from "../../../primitives";

export type ProjectWorkspaceReviewEntryChange = "added" | "deleted" | "modified" | "unchanged";
export type ProjectWorkspaceReviewInlineSize = "tiny" | "micro";

export function ProjectWorkspaceReviewLoadingState({
  className,
  ...props
}: ComponentProps<typeof AppStateMessage>) {
  return <AppStateMessage className={cn("project-workspace-review-loading", className)} {...props} />;
}

export function ProjectWorkspaceReviewEmptyText({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <AppTextEmptyState className={cn("project-workspace-review-empty-text", className)} {...props} />;
}

export function ProjectWorkspaceReviewEmptyBlock({
  className,
  ...props
}: ComponentProps<typeof AppEmptyState>) {
  return <AppEmptyState className={cn("project-workspace-review-empty-block", className)} {...props} />;
}

export function ProjectWorkspaceReviewCallout({
  className,
  ...props
}: ComponentProps<typeof ReviewCallout>) {
  return <ReviewCallout className={cn("project-workspace-review-callout", className)} {...props} />;
}

export function ProjectWorkspaceReviewEntryCallout({
  change,
  className,
  ...props
}: Omit<ComponentProps<typeof ReviewCallout>, "tone"> & {
  change: ProjectWorkspaceReviewEntryChange;
}) {
  return (
    <ReviewCallout
      tone={projectWorkspaceReviewChangeTone(change)}
      compact
      className={cn("project-workspace-review-entry-callout", className)}
      {...props}
    />
  );
}

export function ProjectWorkspaceReviewNoteList({
  notes,
  limit = 4,
  itemKeyPrefix = "project-workspace-review-note",
}: {
  notes: ReactNode[];
  limit?: number;
  itemKeyPrefix?: string;
}) {
  return (
    <>
      {notes.slice(0, limit).map((note, index) => (
        <p key={`${itemKeyPrefix}-${index}`} className="project-workspace-review-note">{note}</p>
      ))}
    </>
  );
}

export function ProjectWorkspaceReviewBadge({
  size = "tiny",
  className,
  ...props
}: ComponentProps<typeof Badge> & {
  size?: ProjectWorkspaceReviewInlineSize;
}) {
  return (
    <Badge
      className={cn("project-workspace-review-badge", `project-workspace-review-badge--${size}`, className)}
      {...props}
    />
  );
}

export function ProjectWorkspaceReviewStatusBadge({
  size = "tiny",
  className,
  ...props
}: StatusBadgeProps & {
  size?: ProjectWorkspaceReviewInlineSize;
}) {
  return (
    <StatusBadge
      className={cn("project-workspace-review-status-badge", `project-workspace-review-status-badge--${size}`, className)}
      {...props}
    />
  );
}

export function ProjectWorkspaceReviewActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("project-workspace-review-action-button", className)} {...props} />;
}

export function ProjectWorkspaceReviewDetailText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("project-workspace-review-detail-text", className)} {...props} />;
}

function projectWorkspaceReviewChangeTone(change: ProjectWorkspaceReviewEntryChange): ReviewTone {
  if (change === "deleted") return "danger";
  return "neutral";
}
