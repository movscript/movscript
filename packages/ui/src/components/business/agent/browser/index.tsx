"use client";

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type FormHTMLAttributes,
  type HTMLAttributes,
  type Ref,
  type ReactNode,
} from "react";

import { AsChildSlot } from "../../../../lib/asChild";
import { cn } from "../../../../lib/cn";
import { AppIconFrame, AppInlineError, AppInlineMeta, AppKeyValue } from "../../app";
import { Badge, Button, DropdownMenuContent, Input } from "../../../primitives";
import { AgentDataBlock } from "../run";
import { AgentSurfaceBlock } from "../surface-block";

export function AgentBrowserRoot({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-browser-root", className)} {...props} />;
}

export function AgentBrowserHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-browser-header", className)} {...props} />;
}

export function AgentBrowserTabBar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-browser-tab-bar", className)} {...props} />;
}

export function AgentBrowserTabList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-browser-tab-list", className)} {...props} />;
}

export function AgentBrowserTabSurface({
  active,
  className,
  ...props
}: ComponentProps<typeof AgentSurfaceBlock> & {
  active?: boolean;
}) {
  return <AgentSurfaceBlock variant={active ? "subtle" : "surface"} className={cn("agent-browser-tab-surface", className)} {...props} />;
}

export function AgentBrowserTabButton({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button type="button" variant="ghost" size="sm" className={cn("agent-browser-tab-button", className)} {...props} />;
}

export function AgentBrowserTabCloseButton({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button type="button" variant="ghost" size="icon-xs" className={cn("agent-browser-tab-close", className)} {...props} />;
}

export function AgentBrowserTabIcon({
  loading,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  loading?: boolean;
}) {
  return <span className={cn("agent-browser-tab-icon", loading && "agent-browser-tab-icon--loading", className)} {...props} />;
}

export function AgentBrowserIconButton({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button type="button" size="icon-xs" variant="ghost" className={cn("agent-browser-icon-button", className)} {...props} />;
}

export function AgentBrowserMenuItemIcon({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-browser-menu-item-icon", className)} {...props} />;
}

export function AgentBrowserMenuContent({ className, ...props }: ComponentProps<typeof DropdownMenuContent>) {
  return <DropdownMenuContent align="end" className={cn("agent-browser-menu-content", className)} {...props} />;
}

export function AgentBrowserToolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-browser-toolbar", className)} {...props} />;
}

export function AgentBrowserUrlMeta({ className, ...props }: ComponentProps<typeof AppInlineMeta>) {
  return <AppInlineMeta className={cn("agent-browser-url-meta", className)} {...props} />;
}

export function AgentBrowserLauncherForm({ className, ...props }: FormHTMLAttributes<HTMLFormElement>) {
  return <form className={cn("agent-browser-launcher-form", className)} {...props} />;
}

export function AgentBrowserAddressForm({ className, ...props }: FormHTMLAttributes<HTMLFormElement>) {
  return <form className={cn("agent-browser-address-form", className)} {...props} />;
}

export function AgentBrowserLauncherIcon({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-browser-launcher-icon", className)} {...props} />;
}

export function AgentBrowserInput({ className, ...props }: ComponentProps<typeof Input>) {
  return <Input className={cn("agent-browser-input", className)} {...props} />;
}

export function AgentBrowserLauncherSubmitButton({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button type="submit" size="sm" className={cn("agent-browser-launcher-submit", className)} {...props} />;
}

export function AgentBrowserInlineError({
  icon,
  children,
  className,
  ...props
}: ComponentProps<typeof AppInlineError> & {
  icon?: ReactNode;
}) {
  return (
    <AppInlineError className={cn("agent-browser-inline-error", className)} {...props}>
      {icon ? <span className="agent-browser-inline-error__icon">{icon}</span> : null}
      <span className="agent-browser-inline-error__text">{children}</span>
    </AppInlineError>
  );
}

export const AgentBrowserViewport = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("agent-browser-viewport", className)} {...props} />,
);

AgentBrowserViewport.displayName = "AgentBrowserViewport";

export function AgentBrowserWebOverlay({
  loading,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  loading?: boolean;
}) {
  return <div className={cn("agent-browser-web-overlay", loading && "agent-browser-web-overlay--loading", className)} {...props} />;
}

export function AgentBrowserResourcePane({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-browser-resource-pane", className)} {...props} />;
}

export function AgentBrowserInternalPane({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-browser-internal-pane", className)} {...props} />;
}

export function AgentBrowserBlankForm({ className, ...props }: FormHTMLAttributes<HTMLFormElement>) {
  return <form className={cn("agent-browser-blank-form", className)} {...props} />;
}

export function AgentBrowserBlankContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-browser-blank-content", className)} {...props} />;
}

export function AgentBrowserSectionIntro({
  title,
  description,
}: {
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <div className="agent-browser-section-intro">
      <h2 className="agent-browser-section-intro__title">{title}</h2>
      <p className="agent-browser-section-intro__description">{description}</p>
    </div>
  );
}

export function AgentBrowserNavGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-browser-nav-grid", className)} {...props} />;
}

export function AgentBrowserNavButton({
  icon,
  title,
  description,
  trailing,
  ...props
}: ComponentProps<typeof Button> & {
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <Button type="button" variant="outline" className="agent-browser-nav-button" {...props}>
      <AppIconFrame size="lg">{icon}</AppIconFrame>
      <span className="agent-browser-nav-button__copy">
        <span className="agent-browser-nav-button__title">{title}</span>
        <span className="agent-browser-nav-button__description">{description}</span>
      </span>
      {trailing ? <span className="agent-browser-nav-button__trailing">{trailing}</span> : null}
    </Button>
  );
}

export function AgentBrowserDividerSection({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-browser-divider-section", className)} {...props} />;
}

export function AgentBrowserSectionLabel({
  icon,
  children,
}: {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="agent-browser-section-label">
      {icon}
      {children}
    </div>
  );
}

export function AgentBrowserInputRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-browser-input-row", className)} {...props} />;
}

export function AgentBrowserProjectEmpty({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <div className="agent-browser-project-empty">
      <AppIconFrame size="lg" className="agent-browser-project-empty__icon">{icon}</AppIconFrame>
      <h2 className="agent-browser-project-empty__title">{title}</h2>
      <p className="agent-browser-project-empty__description">{description}</p>
    </div>
  );
}

export function AgentBrowserProjectPage({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-browser-project-page", className)} {...props} />;
}

export function AgentBrowserProjectNavigationPage({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <AgentBrowserProjectPage className={cn("agent-browser-project-page--navigation", className)} {...props} />;
}

export function AgentBrowserProjectHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-browser-project-header", className)} {...props} />;
}

export function AgentBrowserProjectHeaderCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-browser-project-header__copy", className)} {...props} />;
}

export function AgentBrowserProjectMetaLabel({
  icon,
  children,
}: {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="agent-browser-project-meta-label">
      {icon}
      {children}
    </div>
  );
}

export function AgentBrowserProjectTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("agent-browser-project-title", className)} {...props} />;
}

export function AgentBrowserProjectDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-browser-project-description", className)} {...props} />;
}

export function AgentBrowserBadge({ className, ...props }: ComponentProps<typeof Badge>) {
  return <Badge variant="outline" className={cn("agent-browser-badge", className)} {...props} />;
}

export function AgentBrowserKeyValueGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-browser-key-value-grid", className)} {...props} />;
}

export function AgentBrowserKeyValue(props: ComponentProps<typeof AppKeyValue>) {
  return <AppKeyValue {...props} />;
}

export function AgentBrowserContentToolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-browser-content-nav__toolbar", className)} {...props} />;
}

export function AgentBrowserContentToolButton({
  icon,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
}) {
  return (
    <button type="button" className={cn("agent-browser-content-nav__tool", className)} {...props}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

export function AgentBrowserContentSummary({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("agent-browser-content-nav__summary", className)} {...props} />;
}

export function AgentBrowserContentSummaryMain({
  label,
  value,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className={cn("agent-browser-content-nav__summary-main", className)} {...props}>
      <span className="agent-browser-content-nav__summary-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function AgentBrowserContentSummaryGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-browser-content-nav__summary-grid", className)} {...props} />;
}

export function AgentBrowserContentMatrix({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("agent-browser-content-nav__matrix", className)} {...props} />;
}

export function AgentBrowserContentFlow({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("agent-browser-content-nav__flow", className)} {...props} />;
}

export function AgentBrowserContentGroup({
  tone,
  variant,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  tone: string;
  variant: string;
}) {
  return (
    <section
      className={cn("agent-browser-content-group", className)}
      data-tone={tone}
      data-variant={variant}
      {...props}
    />
  );
}

export function AgentBrowserContentGroupHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-browser-content-group__header", className)} {...props} />;
}

export function AgentBrowserContentGroupIcon({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-browser-content-group__icon", className)} {...props} />;
}

export function AgentBrowserContentGroupCopy({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-browser-content-group__copy", className)} {...props} />;
}

export function AgentBrowserContentGroupTitleRow({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-browser-content-group__title-row", className)} {...props} />;
}

export function AgentBrowserContentGroupIndex({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-browser-content-group__index", className)} {...props} />;
}

export function AgentBrowserContentGroupTitle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-browser-content-group__title", className)} {...props} />;
}

export function AgentBrowserContentGroupDescription({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-browser-content-group__description", className)} {...props} />;
}

export function AgentBrowserContentGroupItems({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-browser-content-group__items", className)} {...props} />;
}

export function AgentBrowserContentGroupState({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-browser-content-group__state", className)} {...props} />;
}

export function AgentBrowserContentGroupOverflow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-browser-content-group__overflow", className)} {...props} />;
}

export const AgentBrowserContentItem = forwardRef<HTMLElement, HTMLAttributes<HTMLElement> & {
  asChild?: boolean;
}>(({ asChild = false, className, ...props }, ref) => {
  if (asChild) {
    return <AsChildSlot ref={ref} fallback="button" className={cn("agent-browser-content-item", className)} {...props} />;
  }
  return <button ref={ref as Ref<HTMLButtonElement>} type="button" className={cn("agent-browser-content-item", className)} {...props} />;
});

AgentBrowserContentItem.displayName = "AgentBrowserContentItem";

export function AgentBrowserContentItemCopy({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-browser-content-item__copy", className)} {...props} />;
}

export function AgentBrowserContentItemTitle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-browser-content-item__title", className)} {...props} />;
}

export function AgentBrowserContentItemDescription({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-browser-content-item__description", className)} {...props} />;
}

export function AgentBrowserContentItemMeta({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-browser-content-item__meta", className)} {...props} />;
}

export function AgentBrowserDataBlock({ className, ...props }: ComponentProps<typeof AgentDataBlock>) {
  return <AgentDataBlock className={cn("agent-browser-data-block", className)} {...props} />;
}

export function AgentBrowserDataBlockTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-browser-data-block__title", className)} {...props} />;
}

export function AgentBrowserDataBlockDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-browser-data-block__description", className)} {...props} />;
}
