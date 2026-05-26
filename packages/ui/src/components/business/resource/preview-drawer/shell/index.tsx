import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { Badge, Button } from "../../../../primitives";

export function ResourcePreviewDrawerOverlay({ open, className, ...props }: HTMLAttributes<HTMLDivElement> & { open: boolean }) {
  if (!open) return null;
  return <div className={cn("resource-preview-drawer__overlay", className)} {...props} />;
}

export function ResourcePreviewDrawerShell({
  open,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  open: boolean;
}) {
  return (
    <div data-open={open ? "true" : "false"} className={cn("resource-preview-drawer", className)} {...props}>
      {children}
    </div>
  );
}

export function ResourcePreviewDrawerHeader({
  icon,
  badge,
  title,
  description,
  closeIcon,
  closeLabel,
  onClose,
}: {
  icon: ReactNode;
  badge: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  closeIcon: ReactNode;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="resource-preview-drawer__header">
      <span className="resource-preview-drawer__header-icon">{icon}</span>
      <div className="resource-preview-drawer__title-block">
        <div className="resource-preview-drawer__title-row">
          <Badge variant="outline" className="resource-preview-drawer__scope-badge">{badge}</Badge>
          <span className="resource-preview-drawer__title">{title}</span>
        </div>
        {description ? <p className="resource-preview-drawer__description">{description}</p> : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onClose}
        className="resource-preview-drawer__close"
        aria-label={closeLabel}
      >
        {closeIcon}
      </Button>
    </div>
  );
}

export function ResourcePreviewDrawerBody({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-preview-drawer__body", className)} {...props}>{children}</div>;
}

export function ResourcePreviewDrawerSidebar({ children, className, ...props }: HTMLAttributes<HTMLElement>) {
  return <aside className={cn("resource-preview-drawer__sidebar", className)} {...props}>{children}</aside>;
}

export function ResourcePreviewDrawerSidebarHeader({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="resource-preview-drawer__sidebar-header">
      <div className="resource-preview-drawer__sidebar-title">
        {icon}
        {title}
      </div>
      {description ? <p className="resource-preview-drawer__sidebar-description">{description}</p> : null}
    </div>
  );
}

export function ResourcePreviewDrawerSidebarContent({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-preview-drawer__sidebar-content", className)} {...props}>{children}</div>;
}

export function ResourcePreviewDrawerSidebarFooter({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-preview-drawer__sidebar-footer", className)} {...props}>{children}</div>;
}

export function ResourcePreviewDrawerMain({ children, className, ...props }: HTMLAttributes<HTMLElement>) {
  return <main className={cn("resource-preview-drawer__main", className)} {...props}>{children}</main>;
}

export function ResourcePreviewDrawerMainBlock({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-preview-drawer__main-block", className)} {...props}>{children}</div>;
}

export function ResourcePreviewDrawerFooter({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-preview-drawer__footer", className)} {...props}>{children}</div>;
}
