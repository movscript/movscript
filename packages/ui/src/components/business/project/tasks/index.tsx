import type { ComponentPropsWithoutRef, HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { accentTextClass, toneTextClass, type AccentTone, type SemanticTone } from "../../../../semantic";
import { AppContentLayout } from "../../../layout";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  NativeSelect,
  StatusBadge,
  Textarea,
} from "../../../primitives";
import { ReviewCallout } from "../../review";
import {
  AppAvatar,
  AppCodeBlock,
  AppEmptyState,
  AppIconFrame,
  AppInlineMeta,
  AppPanel,
  AppSurfaceItem,
} from "../../app";
import { WorkbenchListItem, WorkbenchSurfaceItem } from "../../workbench";
import type { WorkbenchIconComponent } from "../../workbench";
import type { IconComponent } from "../../../primitives/types";

export type ProjectTaskFeedbackTone = SemanticTone;
export type ProjectTaskMetricAccent = AccentTone | "default";
export type ProjectTaskTextTone = SemanticTone | "muted" | "foreground";
export type ProjectTaskTextVariant = "label" | "body" | "title" | "caption" | "tiny" | "mono-label";

export interface ProjectTaskWorkflowStep {
  title: ReactNode;
  detail: ReactNode;
  icon: WorkbenchIconComponent;
}

export interface ProjectTaskMetricItem {
  label: ReactNode;
  value: ReactNode;
  icon: WorkbenchIconComponent;
  iconAccent?: ProjectTaskMetricAccent;
  onClick?: () => void;
}

export function ProjectTaskPageLayout(props: ComponentPropsWithoutRef<typeof AppContentLayout>) {
  return <AppContentLayout variant="contained" width="xwide" contentClassName="project-task-page" {...props} />;
}

export function ProjectTaskMainGrid({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("project-task-main-grid", className)} {...props} />;
}

export function ProjectTaskSidebar({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <aside className={cn("project-task-sidebar", className)} {...props} />;
}

export function ProjectTaskStack({
  density = "normal",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  density?: "normal" | "compact" | "loose";
}) {
  return <div className={cn("project-task-stack", `project-task-stack--${density}`, className)} {...props} />;
}

export function ProjectTaskInlineRow({
  align = "center",
  justify = "start",
  wrap = true,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  align?: "center" | "start";
  justify?: "start" | "between";
  wrap?: boolean;
}) {
  return (
    <div
      className={cn(
        "project-task-inline-row",
        `project-task-inline-row--align-${align}`,
        `project-task-inline-row--justify-${justify}`,
        wrap && "project-task-inline-row--wrap",
        className
      )}
      {...props}
    />
  );
}

export function ProjectTaskText({
  variant = "body",
  tone = "foreground",
  truncate = false,
  clamp = false,
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  variant?: ProjectTaskTextVariant;
  tone?: ProjectTaskTextTone;
  truncate?: boolean;
  clamp?: boolean;
}) {
  const semanticTone = tone === "foreground" || tone === "muted" ? undefined : tone;
  return (
    <p
      className={cn(
        "project-task-text",
        `project-task-text--${variant}`,
        `project-task-text--tone-${tone}`,
        semanticTone && toneTextClass(semanticTone),
        truncate && "project-task-text--truncate",
        clamp && "project-task-text--clamp",
        className
      )}
      {...props}
    />
  );
}

export function ProjectTaskHeading({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("project-task-heading", className)} {...props} />;
}

export function ProjectTaskFormGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-task-form-grid", className)} {...props} />;
}

export function ProjectTaskFormColumn({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-task-form-column", className)} {...props} />;
}

export function ProjectTaskFieldGrid({
  variant = "two",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: "two" | "title-priority" | "id-pair";
}) {
  return <div className={cn("project-task-field-grid", `project-task-field-grid--${variant}`, className)} {...props} />;
}

export function ProjectTaskField({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-task-field", className)} {...props} />;
}

export function ProjectTaskFieldLabel({ className, ...props }: HTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("project-task-field-label", className)} {...props} />;
}

export function ProjectTaskPurposeGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-task-purpose-grid", className)} {...props} />;
}

export function ProjectTaskPurposeButton({
  active,
  title,
  description,
  className,
  ...props
}: Omit<Parameters<typeof Button>[0], "children"> & {
  active?: boolean;
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <Button
      size="md"
      variant={active ? "soft" : "outline"}
      className={cn("project-task-purpose-button", active && "project-task-purpose-button--active", className)}
      {...props}
    >
      <span className="project-task-purpose-button__title">{title}</span>
      <span className="project-task-purpose-button__description">{description}</span>
    </Button>
  );
}

export function ProjectTaskSummaryPanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <ProjectTaskSurfaceItem className={cn("project-task-summary-panel", className)} {...props} />;
}

export function ProjectTaskDividerStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-task-divider-stack", className)} {...props} />;
}

export function ProjectTaskDialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-task-dialog__body", className)} {...props} />;
}

export function ProjectTaskDialogBodyInner({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-task-dialog__body-inner", className)} {...props} />;
}

export function ProjectTaskPanel({
  children,
  className,
  bodyClassName,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  icon?: IconComponent;
  iconClassName?: string;
  action?: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <AppPanel
      className={cn("project-task-panel", className)}
      bodyClassName={cn("project-task-panel__body", bodyClassName)}
      {...props}
    >
      {children}
    </AppPanel>
  );
}

export function ProjectTaskSurfaceItem({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  asChild?: boolean;
  density?: "normal" | "compact";
  variant?: "card" | "overlay" | "muted";
}) {
  return (
    <AppSurfaceItem className={cn("project-task-surface-item", className)} {...props}>
      {children}
    </AppSurfaceItem>
  );
}

export function ProjectTaskListItem({
  children,
  className,
  ...props
}: Parameters<typeof WorkbenchListItem>[0]) {
  return (
    <WorkbenchListItem className={cn("project-task-list-item", className)} {...props}>
      {children}
    </WorkbenchListItem>
  );
}

export function ProjectTaskMeta({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  asChild?: boolean;
  icon?: IconComponent;
  iconClassName?: string;
}) {
  return (
    <AppInlineMeta className={cn("project-task-meta", className)} {...props}>
      {children}
    </AppInlineMeta>
  );
}

export function ProjectTaskBadge({
  children,
  className,
  ...props
}: Parameters<typeof Badge>[0]) {
  return (
    <Badge className={cn("project-task-badge", className)} {...props}>
      {children}
    </Badge>
  );
}

export function ProjectTaskStatusBadge({
  children,
  className,
  ...props
}: Parameters<typeof StatusBadge>[0]) {
  return (
    <StatusBadge className={cn("project-task-status-badge", className)} {...props}>
      {children}
    </StatusBadge>
  );
}

export function ProjectTaskActionButton({
  children,
  className,
  ...props
}: Parameters<typeof Button>[0]) {
  return (
    <Button className={cn("project-task-action-button", className)} {...props}>
      {children}
    </Button>
  );
}

export function ProjectTaskIconActionButton({
  children,
  className,
  ...props
}: Parameters<typeof Button>[0]) {
  return (
    <Button className={cn("project-task-icon-action-button", className)} {...props}>
      {children}
    </Button>
  );
}

export function ProjectTaskInput({
  className,
  ...props
}: Parameters<typeof Input>[0]) {
  return <Input className={cn("project-task-input", className)} {...props} />;
}

export function ProjectTaskSelect({
  className,
  ...props
}: Parameters<typeof NativeSelect>[0]) {
  return <NativeSelect className={cn("project-task-select", className)} {...props} />;
}

export function ProjectTaskTextarea({
  className,
  ...props
}: Parameters<typeof Textarea>[0]) {
  return <Textarea className={cn("project-task-textarea", className)} {...props} />;
}

export function ProjectTaskAvatar(props: Parameters<typeof AppAvatar>[0]) {
  return <AppAvatar {...props} />;
}

export function ProjectTaskCodeBlock(props: Parameters<typeof AppCodeBlock>[0]) {
  return <AppCodeBlock {...props} />;
}

export function ProjectTaskEmptyState({
  className,
  ...props
}: Parameters<typeof AppEmptyState>[0]) {
  return <AppEmptyState className={cn("project-task-empty-state", className)} {...props} />;
}

export function ProjectTaskCallout({
  className,
  ...props
}: Parameters<typeof ReviewCallout>[0]) {
  return <ReviewCallout className={cn("project-task-callout", className)} {...props} />;
}

export function ProjectTaskFilterControl({
  icon: Icon,
  children,
  className,
}: {
  icon: IconComponent;
  children: ReactNode;
  className?: string;
}) {
  return (
    <ProjectTaskSurfaceItem density="compact" className={cn("project-task-filter-control", className)}>
      <Icon size={14} className="project-task-filter-control__icon" />
      {children}
    </ProjectTaskSurfaceItem>
  );
}

export function ProjectTaskListCard({
  children,
  className,
  ...props
}: Parameters<typeof WorkbenchListItem>[0]) {
  return (
    <WorkbenchListItem className={cn("project-task-list-card", className)} {...props}>
      {children}
    </WorkbenchListItem>
  );
}

export function ProjectTaskListCardLayout({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-task-list-card__layout", className)} {...props} />;
}

export function ProjectTaskListCardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-task-list-card__content", className)} {...props} />;
}

export function ProjectTaskListCardBadges({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-task-list-card__badges", className)} {...props} />;
}

export function ProjectTaskSubmitMetaGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-task-submit-meta-grid", className)} {...props} />;
}

export function ProjectTaskMetaList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-task-meta-list", className)} {...props} />;
}

export function ProjectTaskActionStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-task-action-stack", className)} {...props} />;
}

export function ProjectTaskFeedbackText({
  tone = "neutral",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  tone?: ProjectTaskFeedbackTone;
}) {
  return (
    <p className={cn("project-task-feedback-text", toneTextClass(tone), className)} {...props}>
      {children}
    </p>
  );
}

export function ProjectTaskDialog(props: Parameters<typeof Dialog>[0]) {
  return <Dialog {...props} />;
}

export function ProjectTaskDialogContent({
  className,
  ...props
}: Parameters<typeof DialogContent>[0]) {
  return <DialogContent className={cn("project-task-dialog__content", className)} {...props} />;
}

export function ProjectTaskDialogHeader({
  className,
  ...props
}: Parameters<typeof DialogHeader>[0]) {
  return <DialogHeader className={cn("project-task-dialog__header", className)} {...props} />;
}

export function ProjectTaskDialogTitle(props: Parameters<typeof DialogTitle>[0]) {
  return <DialogTitle {...props} />;
}

export function ProjectTaskDialogDescription(props: Parameters<typeof DialogDescription>[0]) {
  return <DialogDescription {...props} />;
}

export function ProjectTaskDialogFooter({
  className,
  ...props
}: Parameters<typeof DialogFooter>[0]) {
  return <DialogFooter className={cn("project-task-dialog__footer", className)} {...props} />;
}

export function ProjectTaskWorkflowGrid({
  steps,
  className,
}: {
  steps: ProjectTaskWorkflowStep[];
  className?: string;
}) {
  return (
    <section className={cn("project-task-workflow-grid", className)}>
      {steps.map((step, index) => {
        const Icon = step.icon;
        return (
          <WorkbenchSurfaceItem key={`${index}-${String(step.title)}`} className="project-task-workflow-step">
            <div className="project-task-workflow-step__body">
              <AppIconFrame className="project-task-workflow-step__icon">
                <Icon size={16} />
              </AppIconFrame>
              <div className="project-task-workflow-step__copy">
                <p className="project-task-workflow-step__title">{index + 1}. {step.title}</p>
                <p className="project-task-workflow-step__detail">{step.detail}</p>
              </div>
            </div>
          </WorkbenchSurfaceItem>
        );
      })}
    </section>
  );
}

export function ProjectTaskMetricGrid({
  metrics,
  className,
}: {
  metrics: ProjectTaskMetricItem[];
  className?: string;
}) {
  return (
    <section className={cn("project-task-metric-grid", className)}>
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <WorkbenchListItem key={String(metric.label)} onClick={metric.onClick} className="project-task-metric-card">
            <div className="project-task-metric-card__header">
              <span className="project-task-metric-card__label">{metric.label}</span>
              <Icon
                size={14}
                className={metric.iconAccent && metric.iconAccent !== "default" ? accentTextClass(metric.iconAccent) : undefined}
              />
            </div>
            <p className="project-task-metric-card__value">{metric.value}</p>
          </WorkbenchListItem>
        );
      })}
    </section>
  );
}

export function ProjectTaskDetailBlock({
  title,
  icon: Icon,
  children,
}: {
  title: ReactNode;
  icon: WorkbenchIconComponent;
  children: ReactNode;
}) {
  return (
    <section className="project-task-detail-block">
      <div className="project-task-detail-block__header">
        <Icon size={14} />
        <span>{title}</span>
      </div>
      {children}
    </section>
  );
}

export function ProjectTaskInfoGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("project-task-info-grid", className)}>{children}</div>;
}

export function ProjectTaskInfoItem({
  label,
  value,
}: {
  label: ReactNode;
  value?: ReactNode;
}) {
  return (
    <WorkbenchSurfaceItem density="compact" className="project-task-info-item">
      <p className="project-task-info-item__label">{label}</p>
      <p className="project-task-info-item__value">{value ?? "无"}</p>
    </WorkbenchSurfaceItem>
  );
}

export function ProjectTaskDetailIntro({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <ProjectTaskText variant="label" tone="muted" className={className} {...props} />;
}

export function ProjectTaskReviewRecord({
  status,
  statusLabel,
  createdAt,
  reviewer,
  comment,
}: {
  status: ComponentPropsWithoutRef<typeof StatusBadge>;
  statusLabel: ReactNode;
  createdAt: ReactNode;
  reviewer: ReactNode;
  comment: ReactNode;
}) {
  return (
    <ProjectTaskSurfaceItem>
      <ProjectTaskInlineRow justify="between">
        <ProjectTaskStatusBadge {...status}>{statusLabel}</ProjectTaskStatusBadge>
        <ProjectTaskText variant="tiny" tone="muted">{createdAt}</ProjectTaskText>
      </ProjectTaskInlineRow>
      <ProjectTaskText variant="label" tone="muted">{comment}</ProjectTaskText>
      <ProjectTaskText variant="tiny" tone="muted">{reviewer}</ProjectTaskText>
    </ProjectTaskSurfaceItem>
  );
}
