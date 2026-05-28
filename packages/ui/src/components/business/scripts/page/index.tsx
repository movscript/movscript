import { forwardRef, type ChangeEventHandler, type ComponentPropsWithoutRef, type HTMLAttributes, type ReactNode, type UIEventHandler } from "react";

import { cn } from "../../../../lib/cn";
import type { UiSemanticIntent } from "../../../../style-system";
import { AppCreateDialog } from "../../app/dialog";
import { AppKeyValue, AppMetricCard } from "../../app/data-display";
import { AppProgressBar } from "../../app/display";
import { AppEmptyState, AppStateMessage } from "../../app/state";
import { AppPanel, AppSurfaceItem } from "../../app/surface";
import { OverlapPane, OverlapPaneGroup } from "../../../layout";
import { Badge, Button, Input, Label, NativeSelect, Textarea, type StatusBadgeProps } from "../../../primitives";
import type { IconComponent } from "../../../primitives/types";

export interface ScriptWorkspaceShellProps extends HTMLAttributes<HTMLDivElement> {
  frameClassName?: string;
}

export function ScriptWorkspaceShell({
  children,
  className,
  frameClassName,
  ...props
}: ScriptWorkspaceShellProps) {
  return (
    <div className={cn("script-workbench-shell", className)} {...props}>
      <div className={cn("script-workbench-frame", frameClassName)}>{children}</div>
    </div>
  );
}

export function ScriptWorkspaceLayout({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <OverlapPaneGroup className={cn("script-workbench-layout", className)} {...props}>
      {children}
    </OverlapPaneGroup>
  );
}

export function ScriptWorkspaceMain({ children, className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <OverlapPane as="main" side="left" className={cn("script-workbench-main", className)} {...props}>
      {children}
    </OverlapPane>
  );
}

export function ScriptWorkspaceInspector({ children, className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <aside className={cn("script-workbench-inspector", className)} {...props}>
      <div className="script-workbench-inspector__body">{children}</div>
    </aside>
  );
}

export function ScriptWorkspaceDetailContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("script-workbench-detail-content", className)} {...props} />;
}

export interface ScriptWorkspaceEmptySelectionProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: IconComponent;
  title: ReactNode;
  action?: ReactNode;
}

export function ScriptWorkspaceEmptySelection({
  icon: Icon,
  title,
  action,
  className,
  ...props
}: ScriptWorkspaceEmptySelectionProps) {
  return (
    <div className={cn("script-workspace-empty-selection", className)} {...props}>
      {Icon ? <Icon size={24} className="script-workspace-empty-selection__icon" /> : null}
      <p className="script-workspace-empty-selection__title">{title}</p>
      {action ? <div className="script-workspace-empty-selection__action">{action}</div> : null}
    </div>
  );
}

export function ScriptWorkspaceStat({
  icon,
  label,
  value,
}: {
  icon: IconComponent;
  label: ReactNode;
  value: ReactNode;
}) {
  return <AppMetricCard icon={icon} label={label} value={value} compact />;
}

export function ScriptEditorFormShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("script-editor-form", className)} {...props} />;
}

export function ScriptEditorToolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <AppSurfaceItem variant="muted" className={cn("script-editor-form__toolbar", className)} {...props} />;
}

export function ScriptEditorToolbarGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("script-editor-form__toolbar-group", className)} {...props} />;
}

export const ScriptEditorHiddenFileInput = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<typeof Input>>(
  ({ className, ...props }, ref) => <Input ref={ref} className={cn("script-editor-form__file-input", className)} {...props} />,
);

ScriptEditorHiddenFileInput.displayName = "ScriptEditorHiddenFileInput";

export function ScriptEditorActionButton({ className, ...props }: ComponentPropsWithoutRef<typeof Button>) {
  return <Button className={cn("script-editor-form__action-button", className)} {...props} />;
}

export function ScriptEditorInlineMeta({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("script-editor-form__inline-meta", className)} {...props} />;
}

export function ScriptEditorErrorText({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("script-editor-form__error-text", className)} {...props} />;
}

export function ScriptEditorVersionState({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("script-editor-form__version-state", className)} {...props} />;
}

export function ScriptEditorVersionTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("script-editor-form__version-title", className)} {...props} />;
}

export function ScriptEditorVersionSubtitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("script-editor-form__version-subtitle", className)} {...props} />;
}

export function ScriptEditorBodyGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("script-editor-form__body-grid", className)} {...props} />;
}

export function ScriptEditorMainField({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("script-editor-form__main-field", className)} {...props} />;
}

export function ScriptEditorFieldLabel({ className, ...props }: ComponentPropsWithoutRef<typeof Label>) {
  return <Label className={cn("script-editor-form__label", className)} {...props} />;
}

export function ScriptEditorBodyTextarea({ className, ...props }: ComponentPropsWithoutRef<typeof Textarea>) {
  return <Textarea className={cn("script-editor-form__body-textarea", className)} {...props} />;
}

export function ScriptEditorSideRail({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <aside className={cn("script-editor-form__side-rail", className)} {...props} />;
}

export function ScriptEditorSidePanel({ className, ...props }: ComponentPropsWithoutRef<typeof AppSurfaceItem>) {
  return <AppSurfaceItem className={cn("script-editor-form__side-panel", className)} {...props} />;
}

export function ScriptEditorInput({ className, ...props }: ComponentPropsWithoutRef<typeof Input>) {
  return <Input className={cn("script-editor-form__input", className)} {...props} />;
}

export function ScriptEditorSummaryTextarea({ className, ...props }: ComponentPropsWithoutRef<typeof Textarea>) {
  return <Textarea className={cn("script-editor-form__summary-textarea", className)} {...props} />;
}

export function ScriptEditorHelperText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("script-editor-form__helper-text", className)} {...props} />;
}

export function ScriptEditorStrongText({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <strong className={cn("script-editor-form__strong-text", className)} {...props} />;
}

export function ScriptMetricBox({
  icon,
  label,
  value,
}: {
  icon: IconComponent;
  label: ReactNode;
  value: ReactNode;
}) {
  return <AppMetricCard icon={icon} label={label} value={value} compact />;
}

export interface ScriptCreateDialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}

export function ScriptCreateDialog({ open, onClose, title, children }: ScriptCreateDialogProps) {
  return (
    <AppCreateDialog open={open} onClose={onClose} title={title}>
      {children}
    </AppCreateDialog>
  );
}

export interface ScriptVersionHistoryPanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function ScriptVersionHistoryPanel({
  title,
  description,
  action,
  children,
  className,
  ...props
}: ScriptVersionHistoryPanelProps) {
  return (
    <div className={cn("script-version-history-panel", className)} {...props}>
      <div className="script-version-history-panel__header">
        <div className="script-version-history-panel__copy">
          <h3 className="script-version-history-panel__title">{title}</h3>
          {description ? <p className="script-version-history-panel__description">{description}</p> : null}
        </div>
        {action ? <div className="script-version-history-panel__action">{action}</div> : null}
      </div>
      {children}
    </div>
  );
}

export interface ScriptVersionEmptyStateProps {
  icon?: IconComponent;
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
}

export function ScriptVersionEmptyState({ icon, title, detail, action }: ScriptVersionEmptyStateProps) {
  return <AppEmptyState icon={icon} title={title} detail={detail} action={action} />;
}

export interface ScriptProductionPanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
}

export function ScriptProductionPanel({
  title,
  description,
  children,
  className,
  ...props
}: ScriptProductionPanelProps) {
  return (
    <div className={cn("script-production-panel", className)} {...props}>
      <div className="script-production-panel__header">
        <h3 className="script-production-panel__title">{title}</h3>
        {description ? <p className="script-production-panel__description">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

export interface ScriptProductionNoticeProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
}

export function ScriptProductionNotice({ title, children, className, ...props }: ScriptProductionNoticeProps) {
  return (
    <AppStateMessage tone="neutral" className={cn("script-production-notice", className)} {...props}>
      <p className="script-production-notice__title">{title}</p>
      {children ? <div className="script-production-notice__body">{children}</div> : null}
    </AppStateMessage>
  );
}

export function ScriptCollaborationEmpty({ icon, title }: { icon?: IconComponent; title: ReactNode }) {
  return <AppEmptyState icon={icon} title={title} compact />;
}

export function ScriptCollaborationStack({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("script-collaboration-stack", className)} {...props}>
      {children}
    </div>
  );
}

export interface ScriptAgentAssistPanelProps {
  icon?: IconComponent;
  title: ReactNode;
  description: ReactNode;
  primaryAction: ReactNode;
  secondaryActions?: ReactNode;
}

export function ScriptAgentAssistPanel({
  icon,
  title,
  description,
  primaryAction,
  secondaryActions,
}: ScriptAgentAssistPanelProps) {
  return (
    <AppPanel icon={icon} title={title} bodyClassName="script-agent-assist-panel__body" className="bg-background">
      <p className="script-agent-assist-panel__description">{description}</p>
      <div className="script-agent-assist-panel__actions">
        {primaryAction}
        {secondaryActions ? <div className="script-agent-assist-panel__secondary">{secondaryActions}</div> : null}
      </div>
    </AppPanel>
  );
}

export interface ScriptReadinessPanelProps {
  title: ReactNode;
  value: number;
  status: ReactNode;
  tone?: "brand" | UiSemanticIntent;
  rows: ReactNode;
  actions?: ReactNode;
}

export function ScriptReadinessPanel({ title, value, status, tone = "brand", rows, actions }: ScriptReadinessPanelProps) {
  return (
    <AppPanel title={title} action={status} className="bg-background">
      <AppProgressBar value={value} tone={tone} />
      <div className="script-readiness-panel__rows">{rows}</div>
      {actions ? <div className="script-readiness-panel__actions">{actions}</div> : null}
    </AppPanel>
  );
}

export interface ScriptPipelinePanelProps {
  title: ReactNode;
  metrics: ReactNode;
  sourceLabel: ReactNode;
  sourceValue: ReactNode;
}

export function ScriptPipelinePanel({ title, metrics, sourceLabel, sourceValue }: ScriptPipelinePanelProps) {
  return (
    <AppPanel title={title} className="bg-background">
      <div className="script-pipeline-panel__metrics">{metrics}</div>
      <AppKeyValue className="script-pipeline-panel__source" label={sourceLabel} value={sourceValue} />
    </AppPanel>
  );
}

export function ScriptPipelineMetric({ label, value }: { label: ReactNode; value: ReactNode }) {
  return <AppMetricCard label={label} value={value} compact />;
}

export function ScriptWorkflowPanel({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <AppPanel title={title} className="bg-background">
      <div className="script-workflow-panel__steps">{children}</div>
    </AppPanel>
  );
}

export function ScriptWorkflowStep({
  index,
  title,
  active,
}: {
  index: ReactNode;
  title: ReactNode;
  active?: boolean;
}) {
  return (
    <AppSurfaceItem
      variant="muted"
      className={cn("script-workflow-step", active && "script-workflow-step--active")}
    >
      <span className="script-workflow-step__index">{index}</span>
      <span className="script-workflow-step__title">{title}</span>
    </AppSurfaceItem>
  );
}

export function ScriptReadinessRow({
  label,
  done,
  status,
}: {
  label: ReactNode;
  done: boolean;
  status: ReactNode;
}) {
  return (
    <AppStateMessage className="script-readiness-row">
      <span className="script-readiness-row__label">{label}</span>
      <span className="script-readiness-row__status" data-ready={done ? "true" : "false"}>
        {status}
      </span>
    </AppStateMessage>
  );
}

export interface ScriptVersionBlockShellProps extends HTMLAttributes<HTMLDivElement> {
  toolbar: ReactNode;
}

export function ScriptVersionBlockShell({
  toolbar,
  children,
  className,
  ...props
}: ScriptVersionBlockShellProps) {
  return (
    <div className={cn("script-version-block-shell", className)} {...props}>
      <div className="script-version-block-shell__toolbar">{toolbar}</div>
      {children}
    </div>
  );
}

export interface ScriptVersionLineEditorProps {
  value: string;
  lines: { line_number: number }[];
  scrollTop: number;
  onScroll?: UIEventHandler<HTMLTextAreaElement>;
  onKeyUp?: React.KeyboardEventHandler<HTMLTextAreaElement>;
  onMouseUp?: React.MouseEventHandler<HTMLTextAreaElement>;
}

export function ScriptVersionLineEditor({
  value,
  lines,
  scrollTop,
  onScroll,
  onKeyUp,
  onMouseUp,
}: ScriptVersionLineEditorProps) {
  return (
    <div className="script-version-line-editor">
      <div className="script-version-line-editor__numbers">
        <div style={{ transform: `translateY(-${scrollTop}px)` }}>
          {lines.map((line) => (
            <div key={line.line_number} className="script-version-line-editor__number">
              {line.line_number}
            </div>
          ))}
        </div>
      </div>
      <Textarea
        readOnly
        wrap="off"
        value={value}
        onKeyUp={onKeyUp}
        onMouseUp={onMouseUp}
        onScroll={onScroll}
        className="script-version-line-editor__textarea"
      />
    </div>
  );
}

export function ScriptBlockGrid({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("script-block-grid", className)} {...props}>
      {children}
    </div>
  );
}

export interface ScriptBlockCardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  range: ReactNode;
  description?: ReactNode;
  usage?: ReactNode;
  fields?: ReactNode;
  actions?: ReactNode;
}

export function ScriptBlockCard({
  title,
  range,
  description,
  usage,
  fields,
  actions,
  className,
  ...props
}: ScriptBlockCardProps) {
  return (
    <AppSurfaceItem className={cn("script-block-card", className)} {...props}>
      <div className="script-block-card__header">
        <span className="script-block-card__title">{title}</span>
        <span className="script-block-card__range">{range}</span>
      </div>
      {description ? <p className="script-block-card__description">{description}</p> : null}
      {usage}
      {fields ? <div className="script-block-card__fields">{fields}</div> : null}
      {actions ? <div className="script-block-card__actions">{actions}</div> : null}
    </AppSurfaceItem>
  );
}

export interface ScriptBlockSelectFieldProps {
  id: string;
  label: ReactNode;
  value: string;
  onChange: ChangeEventHandler<HTMLSelectElement>;
  helper?: ReactNode;
  children: ReactNode;
}

export function ScriptBlockSelectField({
  id,
  label,
  value,
  onChange,
  helper,
  children,
}: ScriptBlockSelectFieldProps) {
  return (
    <div className="script-block-select-field">
      <label className="script-block-select-field__label" htmlFor={id}>
        {label}
      </label>
      <NativeSelect id={id} value={value} onChange={onChange} controlSize="sm">
        {children}
      </NativeSelect>
      {helper ? <p className="script-block-select-field__helper">{helper}</p> : null}
    </div>
  );
}

export function ScriptBlockUsageEmpty({ children }: { children: ReactNode }) {
  return <p className="script-block-usage-empty">{children}</p>;
}

export function ScriptBlockUsageStrip({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("script-block-usage-strip", className)} {...props}>
      {children}
    </div>
  );
}

export function ScriptBlockUsageOverflowBadge({ children }: { children: ReactNode }) {
  return <Badge>{children}</Badge>;
}

export type { StatusBadgeProps as ScriptStatusBadgeProps };
