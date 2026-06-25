import type { ComponentPropsWithoutRef, HTMLAttributes, ReactNode } from "react";
import { Check, Copy } from "lucide-react";

import { toneTextClass } from "@movscript/ui/semantic";
import { cn } from "@/shared/ui/cn";
import { Button, type ButtonProps, type IconComponent } from "@movscript/ui/primitives";
import { OverlapPane, OverlapPaneGroup } from "@movscript/ui/layout";
import { AppCodeBlock, AppEmptyState, AppInlineMeta, AppPanel, AppSurfaceItem } from "@movscript/ui/business/app";
import { ReviewCallout } from "@movscript/ui/business/review";
import "./ToolDialogUi.css";

export function ToolDialogFrame({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-dialog-frame", className)} {...props} />;
}

export function ToolDialogProgramHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-dialog-program-header", className)} {...props} />;
}

export function ToolDialogProgramHeaderText({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-dialog-program-header__text", className)} {...props} />;
}

export function ToolDialogProgramTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn("tool-dialog-program-header__title", className)} {...props} />;
}

export function ToolDialogProgramDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("tool-dialog-program-header__description", className)} {...props} />;
}

export function ToolDialogProgramMeta({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-dialog-program-header__meta", className)} {...props} />;
}

export function ToolDialogProgramMetaItem({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  icon?: ReactNode;
}) {
  return (
    <span className={cn("tool-dialog-program-header__meta-item", className)} {...props}>
      {icon ? <span className="tool-dialog-program-header__meta-icon">{icon}</span> : null}
      <span>{children}</span>
    </span>
  );
}

export function ToolDialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <OverlapPaneGroup overlapSide="left" className={cn("tool-dialog-body", className)} {...props} />;
}

export function ToolDialogMain({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-dialog-main", className)} {...props} />;
}

export type ToolDialogResourcePaneProps = Omit<ComponentPropsWithoutRef<typeof OverlapPane>, "as" | "side">;

export function ToolDialogResourcePane({
  className,
  resizeHandleSide = "left",
  ...props
}: ToolDialogResourcePaneProps) {
  return (
    <OverlapPane
      as="aside"
      side="left"
      resizeHandleSide={resizeHandleSide}
      className={cn("tool-dialog-resource-overlap", className)}
      {...props}
    />
  );
}

export function ToolDialogPanel({
  children,
  className,
  bodyClassName,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  bodyClassName?: string;
}) {
  return (
    <AppPanel
      emphasis="unframed"
      className={cn("tool-dialog-panel", className)}
      bodyClassName={cn("tool-dialog-panel__body", bodyClassName)}
      {...props}
    >
      {children}
    </AppPanel>
  );
}

export function ToolDialogPanelHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-dialog-panel-header", className)} {...props} />;
}

export function ToolDialogWarningCallout({
  icon,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: IconComponent;
}) {
  return <ReviewCallout tone="warning" icon={icon} compact className={cn("tool-dialog-warning-callout", className)} {...props} />;
}

export function ToolDialogDebugPanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <AppSurfaceItem variant="muted" className={cn("tool-dialog-debug-panel", className)} {...props} />;
}

export function ToolDialogDebugTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("tool-dialog-debug-title", className)} {...props} />;
}

export function ToolDialogDebugKV({
  label,
  value,
  mono = true,
  tone = "default",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
  tone?: "default" | "success" | "danger";
}) {
  return (
    <div className={cn("tool-dialog-debug-kv", className)} {...props}>
      <span className="tool-dialog-debug-kv__label">{label}</span>
      <span
        className={cn(
          "tool-dialog-debug-kv__value",
          mono ? "tool-dialog-debug-kv__value--mono" : "tool-dialog-debug-kv__value--sans",
          tone === "success" && toneTextClass("success"),
          tone === "danger" && toneTextClass("danger"),
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function ToolDialogDebugSection({
  title,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
}) {
  return (
    <div className={cn("tool-dialog-debug-section", className)} {...props}>
      <span className="tool-dialog-debug-section__title">{title}</span>
      {children}
    </div>
  );
}

export function ToolDialogDebugEndpoint({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-dialog-debug-endpoint", className)} {...props} />;
}

export function ToolDialogDebugHeaders({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <AppSurfaceItem variant="muted" className={cn("tool-dialog-debug-headers", className)} {...props} />;
}

export function ToolDialogDebugStatus({
  tone = "default",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "default" | "success" | "danger";
}) {
  return (
    <span
      className={cn(
        "tool-dialog-debug-status",
        tone === "success" && toneTextClass("success"),
        tone === "danger" && toneTextClass("danger"),
        className,
      )}
      {...props}
    />
  );
}

export function ToolDialogDebugJsonBlock({
  text,
  action,
  maxHeight = "default",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  text: ReactNode;
  action?: ReactNode;
  maxHeight?: "default" | "large";
}) {
  return (
    <div data-max-height={maxHeight} className={cn("tool-dialog-debug-json", className)} {...props}>
      <AppSurfaceItem variant="muted" className="tool-dialog-debug-json__surface">
        <AppCodeBlock>{text}</AppCodeBlock>
      </AppSurfaceItem>
      {action ? <div className="tool-dialog-debug-json__action">{action}</div> : null}
    </div>
  );
}

export function ToolDialogCopyButton({
  copied,
  copiedLabel,
  copyLabel,
  className,
  ...props
}: ButtonProps & {
  copied: boolean;
  copiedLabel: ReactNode;
  copyLabel: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("tool-dialog-copy-button", className)}
      {...props}
    >
      {copied ? <Check size={12} className={toneTextClass("success")} /> : <Copy size={12} />}
      {copied ? copiedLabel : copyLabel}
    </Button>
  );
}

export function ToolDialogHistoryShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-dialog-history", className)} {...props} />;
}

export function ToolDialogHistoryHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-dialog-history-header", className)} {...props} />;
}

export function ToolDialogHistoryTitle({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
}) {
  return (
    <div className={cn("tool-dialog-history-title", className)} {...props}>
      {icon}
      <span>{children}</span>
    </div>
  );
}

export function ToolDialogHistoryCount({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <AppInlineMeta className={cn("tool-dialog-history-count", className)} {...props} />;
}

export function ToolDialogHistoryPager({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-dialog-history-pager", className)} {...props} />;
}

export function ToolDialogHistoryList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-dialog-history-list", className)} {...props} />;
}

export function ToolDialogEmptyState({
  icon,
  title,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: IconComponent;
  title: ReactNode;
  detail?: ReactNode;
}) {
  return <AppEmptyState icon={icon} title={title} className={cn("tool-dialog-empty-state", className)} {...props} />;
}
