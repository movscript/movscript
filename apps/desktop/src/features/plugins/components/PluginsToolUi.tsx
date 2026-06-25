"use client";

import { forwardRef, type ComponentProps, type HTMLAttributes, type IframeHTMLAttributes, type LabelHTMLAttributes, type ReactNode } from "react";

import { AppCodeBlock, AppInlineMeta, AppStateMessage, AppSurfaceItem } from "@movscript/ui/business/app";
import { Button, Input, NativeSelect, Textarea } from "@movscript/ui/primitives";
import { cn } from "@/shared/ui/cn";

export function PluginToolRoot({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-tool-root", className)} {...props} />;
}

export function PluginToolNativeLayout({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-tool-native-layout", className)} {...props} />;
}

export function PluginToolMain({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-tool-main", className)} {...props} />;
}

export function PluginToolFormStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-tool-form-stack", className)} {...props} />;
}

export function PluginToolField({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-tool-field", className)} {...props} />;
}

export function PluginToolFieldLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("plugin-tool-field__label", className)} {...props} />;
}

export function PluginToolFieldDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("plugin-tool-field__description", className)} {...props} />;
}

export function PluginToolInput({
  className,
  ...props
}: ComponentProps<typeof Input>) {
  return <Input className={cn("plugin-tool-input", className)} {...props} />;
}

export function PluginToolTextarea({
  className,
  ...props
}: ComponentProps<typeof Textarea>) {
  return <Textarea className={cn("plugin-tool-textarea", className)} {...props} />;
}

export function PluginToolSelect({
  className,
  ...props
}: ComponentProps<typeof NativeSelect>) {
  return <NativeSelect className={cn("plugin-tool-select", className)} {...props} />;
}

export function PluginToolSurface({
  className,
  ...props
}: ComponentProps<typeof AppSurfaceItem>) {
  return <AppSurfaceItem className={cn("plugin-tool-surface", className)} {...props} />;
}

export function PluginToolInfoHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-tool-info-header", className)} {...props} />;
}

export function PluginToolInfoCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-tool-info-copy", className)} {...props} />;
}

export function PluginToolVersionMeta({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("plugin-tool-version-meta", className)} {...props} />;
}

export function PluginToolResourceList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-tool-resource-list", className)} {...props} />;
}

export function PluginToolFieldStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-tool-field-stack", className)} {...props} />;
}

export function PluginToolActionRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-tool-action-row", className)} {...props} />;
}

export function PluginToolMutedSurface({
  className,
  ...props
}: ComponentProps<typeof AppSurfaceItem>) {
  return <AppSurfaceItem variant="muted" className={cn("plugin-tool-muted-surface", className)} {...props} />;
}

export function PluginToolInlineResource({
  className,
  ...props
}: ComponentProps<typeof AppInlineMeta>) {
  return <AppInlineMeta className={cn("plugin-tool-inline-resource", className)} {...props} />;
}

export function PluginToolActionButton({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  return <Button className={cn("plugin-tool-action-button", className)} {...props} />;
}

export function PluginToolIconButton({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  return <Button className={cn("plugin-tool-icon-button", className)} {...props} />;
}

export function PluginToolStateMessage({
  className,
  ...props
}: ComponentProps<typeof AppStateMessage>) {
  return <AppStateMessage className={cn("plugin-tool-state-message", className)} {...props} />;
}

export function PluginToolResultTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("plugin-tool-result-title", className)} {...props} />;
}

export function PluginToolCodeBlock({
  className,
  ...props
}: ComponentProps<typeof AppCodeBlock>) {
  return <AppCodeBlock className={cn("plugin-tool-code-block", className)} {...props} />;
}

export function PluginToolLoadingState({
  icon,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
}) {
  return (
    <div className={cn("plugin-tool-loading-state", className)} {...props}>
      {icon}
    </div>
  );
}

export function PluginToolNotFoundState({
  icon,
  title,
  action,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={cn("plugin-tool-not-found-state", className)} {...props}>
      {icon}
      <p className="plugin-tool-not-found-state__title">{title}</p>
      {action}
    </div>
  );
}

export function PluginToolWebviewFrame({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-tool-webview-frame", className)} {...props} />;
}

export const PluginToolIframe = forwardRef<HTMLIFrameElement, IframeHTMLAttributes<HTMLIFrameElement>>(
  ({ className, ...props }, ref) => <iframe ref={ref} className={cn("plugin-tool-iframe", className)} {...props} />,
);
PluginToolIframe.displayName = "PluginToolIframe";
