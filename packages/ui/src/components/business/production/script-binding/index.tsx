import type { ComponentType, HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import {
  Badge,
  Button,
  SelectTrigger,
  StatusBadge,
  type ButtonProps,
  type StatusBadgeProps,
} from "../../../primitives";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../primitives/dialog";
import { WorkbenchEmptyState, WorkbenchList, WorkbenchListItem, WorkbenchSurfaceItem } from "../../workbench";

export type ProductionScriptBindingIcon = ComponentType<{ size?: string | number; className?: string }>;

export function ProductionScriptBindingPanel({
  children,
  className,
  divided = true,
  flushTop = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  divided?: boolean;
  flushTop?: boolean;
}) {
  return (
    <div className={cn("production-script-binding-panel", divided && "production-script-binding-panel--divided", flushTop && "production-script-binding-panel--flush-top", className)} {...props}>
      {children}
    </div>
  );
}

export function ProductionScriptBindingHeader({
  icon: Icon,
  eyebrow,
  description,
  meta,
  actions,
  className,
}: {
  icon?: ProductionScriptBindingIcon;
  eyebrow: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("production-script-binding-header", className)}>
      <div className="production-script-binding-header__copy">
        <div className="production-script-binding-header__eyebrow">
          {Icon ? <Icon size={12} /> : null}
          {eyebrow}
        </div>
        {description ? <p className="production-script-binding-header__description">{description}</p> : null}
        {meta ? <p className="production-script-binding-header__meta">{meta}</p> : null}
      </div>
      {actions ? <div className="production-script-binding-header__actions">{actions}</div> : null}
    </div>
  );
}

export function ProductionScriptBindingInline({
  icon: Icon,
  label,
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ProductionScriptBindingIcon;
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("production-script-binding-inline", className)}>
      <span className="production-script-binding-inline__label">
        {Icon ? <Icon size={12} /> : null}
        {label}
      </span>
      {children}
    </div>
  );
}

export function ProductionScriptBindingSelectTrigger({
  density = "default",
  className,
  ...props
}: Parameters<typeof SelectTrigger>[0] & {
  density?: "default" | "inline";
}) {
  return (
    <SelectTrigger
      className={cn("production-script-binding-select-trigger", `production-script-binding-select-trigger--${density}`, className)}
      {...props}
    />
  );
}

export function ProductionScriptBindingAction({
  className,
  ...props
}: ButtonProps) {
  return <Button className={cn("production-script-binding-action", className)} {...props} />;
}

export function ProductionScriptBindingInlineAction({
  className,
  ...props
}: ButtonProps) {
  return <Button className={cn("production-script-binding-inline-action", className)} {...props} />;
}

export function ProductionScriptBindingIconAction({
  className,
  ...props
}: ButtonProps) {
  return <Button className={cn("production-script-binding-icon-action", className)} {...props} />;
}

export function ProductionScriptBindingPresenceBadge({
  statusProps,
  className,
  children,
  ...props
}: Omit<StatusBadgeProps, "children"> & {
  statusProps?: Omit<StatusBadgeProps, "children">;
  children: ReactNode;
}) {
  return (
    <StatusBadge className={cn("production-script-binding-presence-badge", className)} {...statusProps} {...props}>
      {children}
    </StatusBadge>
  );
}

export function ProductionScriptBindingInlineMeta({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("production-script-binding-inline-meta", className)} {...props} />;
}

export function ProductionScriptBindingSpinner({
  icon: Icon,
  className,
}: {
  icon: ProductionScriptBindingIcon;
  className?: string;
}) {
  return <Icon size={14} className={cn("production-script-binding-spinner", className)} />;
}

export function ProductionScriptBlockSummary({
  title,
  description,
  empty,
  actions,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description: ReactNode;
  empty?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div className={cn("production-script-block-summary", className)}>
      <div className="production-script-block-summary__copy">
        <p className="production-script-block-summary__title">{title}</p>
        <p className={cn("production-script-block-summary__description", empty && "production-script-block-summary__description--empty")}>
          {description}
        </p>
      </div>
      {actions ? <div className="production-script-block-summary__actions">{actions}</div> : null}
    </div>
  );
}

export function ProductionScriptBlockBoundBadge({ children = "已绑定", className, ...props }: Parameters<typeof Badge>[0]) {
  return <Badge className={cn("production-script-block-bound-badge", className)} {...props}>{children}</Badge>;
}

export function ProductionScriptPickerContent({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <DialogContent className={cn("production-script-picker-content", className)}>
      <DialogHeader className="production-script-picker-header">
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </DialogHeader>
      {children}
      {footer ? <div className="production-script-picker-footer">{footer}</div> : null}
    </DialogContent>
  );
}

export function ProductionScriptPickerLayout({
  sidebar,
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("production-script-picker-layout", className)}>
      <div className="production-script-picker-layout__sidebar">{sidebar}</div>
      <div className="production-script-picker-layout__main">{children}</div>
    </div>
  );
}

export function ProductionScriptBlockList({ children, className }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <WorkbenchList className={cn("production-script-block-list", className)}>{children}</WorkbenchList>;
}

export function ProductionScriptBlockListItem({
  active,
  title,
  badge,
  description,
  children,
  className,
  ...props
}: Parameters<typeof WorkbenchListItem>[0] & {
  active?: boolean;
  title: ReactNode;
  badge?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <WorkbenchListItem active={active} className={cn("production-script-block-list-item", className)} {...props}>
      <div className="production-script-block-list-item__header">
        <span className="production-script-block-list-item__title">{title}</span>
        {badge}
      </div>
      {description ? <p className="production-script-block-list-item__description">{description}</p> : null}
      {children}
    </WorkbenchListItem>
  );
}

export function ProductionScriptCreatePanel({
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ProductionScriptBindingIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <WorkbenchSurfaceItem className={cn("production-script-create-panel", className)}>
      <div className="production-script-create-panel__header">
        <div className="production-script-create-panel__copy">
          <div className="production-script-create-panel__eyebrow">
            {Icon ? <Icon size={12} /> : null}
            {title}
          </div>
          {description ? <p className="production-script-create-panel__description">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </WorkbenchSurfaceItem>
  );
}

export function ProductionScriptLineList({ children, className }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <WorkbenchList className={cn("production-script-line-list", className)}>{children}</WorkbenchList>;
}

export function ProductionScriptLineItem({
  active,
  anchor,
  lineNumber,
  children,
  className,
  ...props
}: Parameters<typeof WorkbenchListItem>[0] & {
  active?: boolean;
  anchor?: boolean;
  lineNumber: ReactNode;
}) {
  return (
    <WorkbenchListItem
      active={active}
      className={cn("production-script-line-item", anchor && "production-script-line-item--anchor", className)}
      {...props}
    >
      <span className="production-script-line-item__number">{lineNumber}</span>
      <span className="production-script-line-item__content">{children}</span>
    </WorkbenchListItem>
  );
}

export function ProductionScriptSelectionSummary({
  label,
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  children?: ReactNode;
}) {
  return (
    <WorkbenchSurfaceItem density="compact" className={cn("production-script-selection-summary", className)}>
      <p className="production-script-selection-summary__label">{label}</p>
      {children ? <p className="production-script-selection-summary__text">{children}</p> : null}
    </WorkbenchSurfaceItem>
  );
}

export function ProductionScriptCreateEmptyState({ title }: { title: ReactNode }) {
  return <WorkbenchEmptyState compact className="production-script-create-empty-state" title={title} />;
}

export function ProductionScriptPickerPreviewHeader({
  title,
  description,
  actions,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={cn("production-script-picker-preview-header", className)}>
      <div className="production-script-picker-preview-header__copy">
        <p className="production-script-picker-preview-header__title">{title}</p>
        {description ? <p className="production-script-picker-preview-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="production-script-picker-preview-header__actions">{actions}</div> : null}
    </div>
  );
}

export function ProductionScriptPreviewStack({ children, className }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div className={cn("production-script-preview-stack", className)}>{children}</div>;
}

export function ProductionScriptPreviewCard({
  active,
  meta,
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <WorkbenchSurfaceItem active={active} className={cn("production-script-preview-card", className)}>
      {meta ? <div className="production-script-preview-card__meta">{meta}</div> : null}
      <p className="production-script-preview-card__body">{children}</p>
    </WorkbenchSurfaceItem>
  );
}

export function ProductionScriptPreviewRoleBadge({
  active,
  children,
  className,
}: Parameters<typeof Badge>[0] & {
  active?: boolean;
}) {
  return (
    <Badge variant={active ? "soft" : "outline"} className={cn("production-script-preview-role-badge", className)}>
      {children}
    </Badge>
  );
}

export function ProductionScriptPreviewMetaText({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("production-script-preview-meta-text", className)} {...props} />;
}
