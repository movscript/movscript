import type { ComponentPropsWithoutRef, ComponentType, HTMLAttributes, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "../../../../lib/cn";
import { AppIconFrame } from "../../app/display/icon";
import { WorkbenchEmptyState } from "../../workbench";
import {
  Badge,
  Button,
  DialogContent,
  SelectTrigger,
  StatusBadge,
  Textarea,
  type BadgeProps,
  type ButtonProps,
  type StatusBadgeProps,
  type TextareaProps,
} from "../../../primitives";

export type ProductionSceneWritingIcon = ComponentType<{ size?: string | number; className?: string }>;

export function ProductionSceneWritingSection({
  children,
  className,
  divided = true,
  flushTop = false,
  ...props
}: HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  divided?: boolean;
  flushTop?: boolean;
}) {
  return (
    <section
      className={cn("production-scene-writing-section", divided && "production-scene-writing-section--divided", flushTop && "production-scene-writing-section--flush-top", className)}
      {...props}
    >
      {children}
    </section>
  );
}

export function ProductionSceneWritingHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  icon?: ProductionSceneWritingIcon;
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("production-scene-writing-header", className)}>
      <div className="production-scene-writing-header__copy">
        <div className="production-scene-writing-header__eyebrow">
          {Icon ? <Icon size={12} /> : null}
          {eyebrow}
        </div>
        <h3 className="production-scene-writing-header__title">{title}</h3>
        {description ? <p className="production-scene-writing-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="production-scene-writing-header__actions">{actions}</div> : null}
    </div>
  );
}

export function ProductionSceneWritingBadgeStack({
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={cn("production-scene-writing-badge-stack", className)}>{children}</div>;
}

export function ProductionSceneWritingResponsiveDescription({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("production-scene-writing-responsive-description", className)} {...props} />;
}

export function ProductionSceneWritingBadge({
  className,
  ...props
}: BadgeProps) {
  return <Badge className={cn("production-scene-writing-badge", className)} {...props} />;
}

export function ProductionSceneWritingStatusBadge({
  statusProps,
  className,
  children,
  ...props
}: Omit<StatusBadgeProps, "children"> & {
  statusProps?: Omit<StatusBadgeProps, "children">;
  children: ReactNode;
}) {
  return (
    <StatusBadge className={cn("production-scene-writing-badge", className)} {...statusProps} {...props}>
      {children}
    </StatusBadge>
  );
}

export function ProductionSceneWritingSpinner({
  icon: Icon,
  className,
}: {
  icon: ProductionSceneWritingIcon;
  className?: string;
}) {
  return <Icon size={12} className={cn("production-scene-writing-spinner", className)} />;
}

export function ProductionSceneReferenceGroupGrid({
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={cn("production-scene-reference-grid", className)}>{children}</div>;
}

export function ProductionSceneReferenceGroup({
  title,
  count,
  children,
  emptyLabel = "待绑定",
  className,
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  count: ReactNode;
  children?: ReactNode;
  emptyLabel?: ReactNode;
}) {
  const hasChildren = Boolean(children);
  return (
    <div className={cn("production-scene-reference-group", className)}>
      <div className="production-scene-reference-group__header">
        <p className="production-scene-reference-group__title">{title}</p>
        <span className="production-scene-reference-group__count">{count}</span>
      </div>
      <div className="production-scene-reference-group__body">
        {hasChildren ? children : <p className="production-scene-reference-group__empty">{emptyLabel}</p>}
      </div>
    </div>
  );
}

export function ProductionSceneReferenceItem({
  title,
  meta,
  action,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={cn("production-scene-reference-item", className)}>
      <div className="production-scene-reference-item__copy">
        <p className="production-scene-reference-item__title">{title}</p>
        {meta ? <p className="production-scene-reference-item__meta">{meta}</p> : null}
      </div>
      {action ? <div className="production-scene-reference-item__action">{action}</div> : null}
    </div>
  );
}

export function ProductionSceneReferenceRemoveButton({
  className,
  ...props
}: ButtonProps) {
  return <Button size="icon-xs" variant="ghost" tone="danger" className={cn("production-scene-reference-remove-button", className)} {...props} />;
}

export function ProductionSceneWritingDialogContent({
  wide = false,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogContent> & {
  wide?: boolean;
}) {
  return (
    <DialogContent
      className={cn("production-scene-writing-dialog-content", wide && "production-scene-writing-dialog-content--wide", className)}
      {...props}
    />
  );
}

export function ProductionSceneWritingDialogBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-scene-writing-dialog-body", className)} {...props} />;
}

export function ProductionSceneReferenceEmptyState({ title }: { title: ReactNode }) {
  return <WorkbenchEmptyState compact className="production-scene-reference-empty-state" title={title} />;
}

export function ProductionSceneReferenceBindingRow({
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={cn("production-scene-reference-binding-row", className)}>{children}</div>;
}

export function ProductionSceneWritingSelectTrigger({
  kind = "default",
  className,
  ...props
}: Parameters<typeof SelectTrigger>[0] & {
  kind?: "default" | "expression-kind" | "expression-speaker";
}) {
  return <SelectTrigger className={cn("production-scene-writing-select-trigger", `production-scene-writing-select-trigger--${kind}`, className)} {...props} />;
}

export function ProductionSceneWritingActionButton({
  className,
  ...props
}: ButtonProps) {
  return <Button className={cn("production-scene-writing-action-button", className)} {...props} />;
}

export function ProductionSceneWritingFieldGrid({
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={cn("production-scene-writing-field-grid", className)}>{children}</div>;
}

export function ProductionSceneWritingField({
  label,
  children,
  className,
  spaced = false,
}: HTMLAttributes<HTMLLabelElement> & {
  label: ReactNode;
  children: ReactNode;
  spaced?: boolean;
}) {
  return (
    <label className={cn("production-scene-writing-field", spaced && "production-scene-writing-field--spaced", className)}>
      <span className="production-scene-writing-field__label">{label}</span>
      {children}
    </label>
  );
}

export function ProductionSceneWritingTextarea({
  kind = "body-compact",
  className,
  ...props
}: TextareaProps & {
  kind?: "body-compact" | "body" | "note" | "speaker" | "expression" | "expression-note";
}) {
  return <Textarea className={cn("production-scene-writing-textarea", `production-scene-writing-textarea--${kind}`, className)} {...props} />;
}

export function ProductionSceneMomentEmptyState({ title }: { title: ReactNode }) {
  return <WorkbenchEmptyState compact className="production-scene-moment-empty-state" title={title} />;
}

export function ProductionSceneMomentSummaryCard({
  title,
  time,
  description,
  mood,
  actions,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  time?: ReactNode;
  description?: ReactNode;
  mood?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={cn("production-scene-moment-summary-card", className)}>
      <div className="production-scene-moment-summary-card__copy">
        <div className="production-scene-moment-summary-card__topline">
          <h4 className="production-scene-moment-summary-card__title">{title}</h4>
          {time ? <span className="production-scene-moment-summary-card__time">{time}</span> : null}
        </div>
        {description ? <p className="production-scene-moment-summary-card__description">{description}</p> : null}
        {mood ? <p className="production-scene-moment-summary-card__mood">{mood}</p> : null}
      </div>
      {actions ? <div className="production-scene-moment-summary-card__actions">{actions}</div> : null}
    </div>
  );
}

export function ProductionSceneWritingActionRow({
  leading,
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  leading?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("production-scene-writing-action-row", className)}>
      <div className="production-scene-writing-action-row__leading">{leading}</div>
      <div className="production-scene-writing-action-row__actions">{children}</div>
    </div>
  );
}

export function ProductionExpressionLineStack({
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={cn("production-expression-line-stack", className)}>{children}</div>;
}

export function ProductionExpressionEmptyState({ title }: { title: ReactNode }) {
  return <WorkbenchEmptyState compact title={title} />;
}

export function ProductionExpressionBadge({
  className,
  ...props
}: BadgeProps) {
  return <Badge className={cn("production-expression-badge", className)} {...props} />;
}

export function ProductionExpressionDeleteButton({
  className,
  ...props
}: ButtonProps) {
  return <Button size="icon-sm" variant="ghost" tone="danger" className={cn("production-expression-delete-button", className)} {...props} />;
}

export function ProductionExpressionLineShell({
  index,
  badges,
  speaker,
  preview,
  meta,
  actions,
  children,
  defaultOpen = false,
  className,
}: HTMLAttributes<HTMLDetailsElement> & {
  index: number;
  badges?: ReactNode;
  speaker?: ReactNode;
  preview: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className={cn("production-expression-line", className)} open={defaultOpen}>
      <summary className="production-expression-line__summary">
        <AppIconFrame className="production-expression-line__index">{String(index + 1).padStart(2, "0")}</AppIconFrame>
        <div className="production-expression-line__copy">
          <div className="production-expression-line__badges">
            {badges}
            {speaker ? <span className="production-expression-line__speaker">{speaker}</span> : null}
          </div>
          <p className="production-expression-line__preview">{preview}</p>
          {meta ? <p className="production-expression-line__meta">{meta}</p> : null}
        </div>
        {actions}
        <ChevronDown size={14} className="production-expression-line__chevron" />
      </summary>
      <div className="production-expression-line__body">{children}</div>
    </details>
  );
}

export function ProductionExpressionEditorGrid({
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={cn("production-expression-editor-grid", className)}>{children}</div>;
}

export function ProductionExpressionEditorColumn({
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={cn("production-expression-editor-column", className)}>{children}</div>;
}

export function ProductionExpressionField({
  label,
  children,
  className,
}: HTMLAttributes<HTMLLabelElement> & {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className={cn("production-expression-field", className)}>
      <span className="production-expression-field__label">{label}</span>
      {children}
    </label>
  );
}

export function ProductionExpressionAuxFieldGrid({
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={cn("production-expression-aux-field-grid", className)}>{children}</div>;
}

export function ProductionExpressionEditorActions({
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={cn("production-expression-editor-actions", className)}>{children}</div>;
}
