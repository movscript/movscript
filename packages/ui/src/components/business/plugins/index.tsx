"use client";

import { forwardRef, type ComponentProps, type HTMLAttributes, type IframeHTMLAttributes, type ReactNode } from "react";

import { cn } from "../../../lib/cn";
import { toneTextClass, type SemanticTone } from "../../../semantic";
import { AppContentLayout } from "../../layout";
import {
  AppCodeBlock,
  AppControlGroup,
  AppEmptyState,
  AppInlineMeta,
  AppStateMessage,
  AppSurfaceItem,
} from "../app";
import { Button, Input, NativeSelect, Textarea } from "../../primitives";
import type { IconComponent } from "../../primitives/types";

export function PluginPageLayout({
  className,
  contentClassName,
  ...props
}: ComponentProps<typeof AppContentLayout>) {
  return (
    <AppContentLayout
      variant="workspace"
      padding="none"
      scroll="hidden"
      className={className}
      contentClassName={cn("plugin-page-layout", contentClassName)}
      {...props}
    />
  );
}

export function PluginPageHeader({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <header className={cn("plugin-page-header", className)} {...props} />;
}

export function PluginPageHeaderInner({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-page-header__inner", className)} {...props} />;
}

export function PluginPageHeaderCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-page-header__copy", className)} {...props} />;
}

export function PluginPageHeaderTitleRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-page-header__title-row", className)} {...props} />;
}

export function PluginPageHeaderActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-page-header__actions", className)} {...props} />;
}

export function PluginPageTabBar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-page-tab-bar", className)} {...props} />;
}

export function PluginPageScrollBody({
  padded = true,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  padded?: boolean;
}) {
  return <div data-padded={padded ? "true" : undefined} className={cn("plugin-page-scroll-body", className)} {...props} />;
}

export function PluginPageCardGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-page-card-grid", className)} {...props} />;
}

export function PluginDialogOverlay({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-dialog-overlay", className)} {...props} />;
}

export function PluginDialogTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("plugin-dialog-title", className)} {...props} />;
}

export function PluginDialogDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("plugin-dialog-description", className)} {...props} />;
}

export function PluginDialogActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-dialog-actions", className)} {...props} />;
}

export function PluginDialogSurface({
  className,
  ...props
}: ComponentProps<typeof AppSurfaceItem>) {
  return <AppSurfaceItem className={cn("plugin-dialog-surface", className)} {...props} />;
}

export function PluginCardSurface({
  className,
  ...props
}: ComponentProps<typeof AppSurfaceItem>) {
  return <AppSurfaceItem className={cn("plugin-card-surface", className)} {...props} />;
}

export function PluginCardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-card-header", className)} {...props} />;
}

export function PluginCardCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-card-copy", className)} {...props} />;
}

export function PluginCardActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-card-actions", className)} {...props} />;
}

export function PluginCardTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("plugin-card-title", className)} {...props} />;
}

export function PluginCardMeta({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("plugin-card-meta", className)} {...props} />;
}

export function PluginCardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("plugin-card-description", className)} {...props} />;
}

export function PluginCardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-card-footer", className)} {...props} />;
}

export function PluginCardId({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("plugin-card-id", className)} {...props} />;
}

export function PluginCardTagRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-card-tag-row", className)} {...props} />;
}

export function PluginCardDownloadMeta({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("plugin-card-download-meta", className)} {...props} />;
}

export function PluginMarketplaceToolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-marketplace-toolbar", className)} {...props} />;
}

export function PluginSearchField({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-search-field", className)} {...props} />;
}

export function PluginSearchIconSlot({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-search-field__icon", className)} {...props} />;
}

export function PluginEmptyActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plugin-empty-actions", className)} {...props} />;
}

export function PluginEmptyState({
  className,
  ...props
}: ComponentProps<typeof AppEmptyState>) {
  return <AppEmptyState className={cn("plugin-empty-state", className)} {...props} />;
}

export function PluginStateBanner({
  className,
  ...props
}: ComponentProps<typeof AppStateMessage>) {
  return <AppStateMessage className={cn("plugin-state-banner", className)} {...props} />;
}

export function PluginTabGroup({
  className,
  ...props
}: ComponentProps<typeof AppControlGroup>) {
  return <AppControlGroup className={cn("plugin-tab-group", className)} {...props} />;
}

export function PluginInlineMeta({
  className,
  ...props
}: ComponentProps<typeof AppInlineMeta>) {
  return <AppInlineMeta className={cn("plugin-inline-meta", className)} {...props} />;
}

export function PluginStatusMeta({
  className,
  ...props
}: ComponentProps<typeof AppInlineMeta>) {
  return <AppInlineMeta className={cn("plugin-status-meta", className)} {...props} />;
}

export function PluginTagMeta({
  className,
  ...props
}: ComponentProps<typeof AppInlineMeta>) {
  return <AppInlineMeta className={cn("plugin-tag-meta", className)} {...props} />;
}

export function PluginToneText({
  as: Element = "p",
  tone,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "div" | "p" | "span";
  tone: SemanticTone;
  children?: ReactNode;
}) {
  return (
    <Element className={cn("plugin-tone-text", toneTextClass(tone), className)} {...props}>
      {children}
    </Element>
  );
}

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

export function PluginToolFieldLabel({ className, ...props }: HTMLAttributes<HTMLLabelElement>) {
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
