import { forwardRef, type ComponentPropsWithoutRef, type ComponentPropsWithRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from '@movscript/ui/primitives';
import { toneSurfaceClass, type SemanticTone } from "@movscript/ui/semantic";
import { AppCodeBlock, AppInlineMeta, AppSurfaceItem, AppTextEmptyState } from "@movscript/ui/business/app";
import { WorkbenchEmptyState, WorkbenchMetric, WorkbenchSurfaceItem } from "@movscript/ui/business/workbench";
import { AppContentLayout } from "@movscript/ui/layout";
import {
  Badge,
  Button,
  CheckboxField,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  Textarea,
} from "@movscript/ui/primitives";
import "./ProjectStandardsUi.css";

export type ProjectStandardsSurfaceTone = Extract<SemanticTone, "neutral" | "warning">;

export {
  ProjectWorkspaceReviewActionButton,
  ProjectWorkspaceReviewBadge,
  ProjectWorkspaceReviewCallout,
  ProjectWorkspaceReviewEmptyBlock,
  ProjectWorkspaceReviewEmptyText,
  ProjectWorkspaceReviewEntryCallout,
  ProjectWorkspaceReviewLoadingState,
  ProjectWorkspaceReviewNoteList,
  ProjectWorkspaceReviewStatusBadge,
  ProjectWorkspaceReviewDetailText,
  type ProjectWorkspaceReviewEntryChange,
  type ProjectWorkspaceReviewInlineSize,
} from "./workspaces/ProjectStandardsWorkspaceReviewPrimitives";

export function ProjectStandardsContentLayout({
  className,
  contentClassName,
  ...props
}: ComponentPropsWithoutRef<typeof AppContentLayout>) {
  return (
    <AppContentLayout
      variant="contained"
      width="full"
      padding="compact"
      scroll="auto"
      className={cn("project-standards-content-layout", className)}
      contentClassName={cn("project-standards-content-layout__content", contentClassName)}
      {...props}
    />
  );
}

export function ProjectStandardsMain({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <main className={cn("project-standards-main", className)} {...props} />;
}

export function ProjectStandardsMetricGrid({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("project-standards-metric-grid", className)} {...props} />;
}

export function ProjectStandardsMetric(props: ComponentPropsWithoutRef<typeof WorkbenchMetric>) {
  return <WorkbenchMetric {...props} />;
}

export function ProjectStandardsWorkspaceGrid({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("project-standards-workspace-grid", className)} {...props} />;
}

export function ProjectStandardsColumn({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-standards-column", className)} {...props} />;
}

export function ProjectStandardsSection({
  border = false,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  border?: boolean;
}) {
  return <section className={cn("project-standards-section", border && "project-standards-section--border", className)} {...props} />;
}

export function ProjectStandardsSectionHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-standards-section-header", className)} {...props} />;
}

export function ProjectStandardsTitleRow({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("project-standards-title-row", className)} {...props} />;
}

export function ProjectStandardsTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("project-standards-title", className)} {...props} />;
}

export function ProjectStandardsDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("project-standards-description", className)} {...props} />;
}

export function ProjectStandardsBodyText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("project-standards-body-text", className)} {...props} />;
}

export function ProjectStandardsTinyText({
  mono = false,
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  mono?: boolean;
}) {
  return <p className={cn("project-standards-tiny-text", mono && "project-standards-tiny-text--mono", className)} {...props} />;
}

export function ProjectStandardsCoreGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-standards-core-grid", className)} {...props} />;
}

export function ProjectStandardsSurfaceItem({
  tone = "neutral",
  className,
  ...props
}: ComponentPropsWithoutRef<typeof WorkbenchSurfaceItem> & {
  tone?: ProjectStandardsSurfaceTone;
}) {
  return (
    <WorkbenchSurfaceItem
      className={cn("project-standards-surface-item", tone === "warning" && toneSurfaceClass("warning"), className)}
      {...props}
    />
  );
}

export function ProjectStandardsAppSurface({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof AppSurfaceItem>) {
  return <AppSurfaceItem className={cn("project-standards-app-surface", className)} {...props} />;
}

export function ProjectStandardsInlineMeta({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof AppInlineMeta>) {
  return <AppInlineMeta className={cn("project-standards-inline-meta", className)} {...props} />;
}

export function ProjectStandardsBadge({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Badge>) {
  return <Badge className={cn("project-standards-badge", className)} {...props} />;
}

export function ProjectStandardsStatusBadge({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof StatusBadge>) {
  return <StatusBadge className={cn("project-standards-status-badge", className)} {...props} />;
}

export function ProjectStandardsActionButton({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Button>) {
  return <Button className={cn("project-standards-action-button", className)} {...props} />;
}

export function ProjectStandardsIconButton({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Button>) {
  return <Button className={cn("project-standards-icon-button", className)} {...props} />;
}

export const ProjectStandardsInput = forwardRef<HTMLInputElement, ComponentPropsWithRef<typeof Input>>(
  ({ className, ...props }, ref) => <Input ref={ref} className={cn("project-standards-input", className)} {...props} />,
);
ProjectStandardsInput.displayName = "ProjectStandardsInput";

export function ProjectStandardsTextarea({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Textarea>) {
  return <Textarea className={cn("project-standards-textarea", className)} {...props} />;
}

export function ProjectStandardsCheckboxField({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof CheckboxField>) {
  return <CheckboxField className={cn("project-standards-checkbox-field", className)} {...props} />;
}

export function ProjectStandardsSelect(props: ComponentPropsWithoutRef<typeof Select>) {
  return <Select {...props} />;
}

export function ProjectStandardsSelectTrigger({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof SelectTrigger>) {
  return <SelectTrigger className={cn("project-standards-select-trigger", className)} {...props} />;
}

export function ProjectStandardsSelectContent(props: ComponentPropsWithoutRef<typeof SelectContent>) {
  return <SelectContent {...props} />;
}

export function ProjectStandardsSelectItem(props: ComponentPropsWithoutRef<typeof SelectItem>) {
  return <SelectItem {...props} />;
}

export function ProjectStandardsSelectValue(props: ComponentPropsWithoutRef<typeof SelectValue>) {
  return <SelectValue {...props} />;
}

export function ProjectStandardsEmptyText({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof AppTextEmptyState>) {
  return <AppTextEmptyState className={cn("project-standards-empty-text", className)} {...props} />;
}

export function ProjectStandardsEmptyState(props: ComponentPropsWithoutRef<typeof WorkbenchEmptyState>) {
  return <WorkbenchEmptyState {...props} />;
}

export function ProjectStandardsImageGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-standards-image-grid", className)} {...props} />;
}

export function ProjectStandardsImageCard({ className, ...props }: ComponentPropsWithoutRef<typeof WorkbenchSurfaceItem>) {
  return <WorkbenchSurfaceItem className={cn("project-standards-image-card", className)} {...props} />;
}

export function ProjectStandardsImageFrame({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-standards-image-frame", className)} {...props} />;
}

export function ProjectStandardsImageMeta({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-standards-image-meta", className)} {...props} />;
}

export function ProjectStandardsRuleForm({ className, ...props }: ComponentPropsWithoutRef<typeof WorkbenchSurfaceItem>) {
  return <WorkbenchSurfaceItem className={cn("project-standards-rule-form", className)} {...props} />;
}

export function ProjectStandardsFormGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-standards-form-grid", className)} {...props} />;
}

export function ProjectStandardsField({ className, ...props }: HTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("project-standards-field", className)} {...props} />;
}

export function ProjectStandardsFieldActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-standards-field-actions", className)} {...props} />;
}

export function ProjectStandardsRuleList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-standards-rule-list", className)} {...props} />;
}

export function ProjectStandardsRuleCard({
  disabled = false,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof WorkbenchSurfaceItem> & {
  disabled?: boolean;
}) {
  return <WorkbenchSurfaceItem className={cn("project-standards-rule-card", disabled && "project-standards-rule-card--disabled", className)} {...props} />;
}

export function ProjectStandardsRuleCardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-standards-rule-card__header", className)} {...props} />;
}

export function ProjectStandardsRuleActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-standards-rule-actions", className)} {...props} />;
}

export function ProjectStandardsPreviewAside({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <aside className={cn("project-standards-preview-aside", className)} {...props} />;
}

export function ProjectStandardsPreviewSurface({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof AppSurfaceItem>) {
  return <AppSurfaceItem className={cn("project-standards-preview-surface", className)} {...props} />;
}

export function ProjectStandardsCodeBlock({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof AppCodeBlock>) {
  return <AppCodeBlock className={cn("project-standards-code-block", className)} {...props} />;
}

export function ProjectStandardsLoadingState({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
}) {
  return (
    <div className={cn("project-standards-loading-state", className)} {...props}>
      {icon}
      {children}
    </div>
  );
}

export function ProjectStandardsDialog(props: ComponentPropsWithoutRef<typeof Dialog>) {
  return <Dialog {...props} />;
}

export function ProjectStandardsDialogContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogContent>) {
  return <DialogContent className={cn("project-standards-dialog-content", className)} {...props} />;
}

export function ProjectStandardsDialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-standards-dialog-body", className)} {...props} />;
}

export function ProjectStandardsDialogTitle(props: ComponentPropsWithoutRef<typeof DialogTitle>) {
  return <DialogTitle {...props} />;
}
