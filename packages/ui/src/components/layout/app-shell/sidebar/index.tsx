"use client";

import * as React from "react";

import { Avatar, AvatarFallback } from "../../../primitives/avatar";
import { Button } from "../../../primitives/button";
import { DropdownMenuContent } from "../../../primitives/dropdown-menu";
import { ChevronDownIcon, ChevronRightIcon } from "../../../primitives/icons";
import type { IconComponent } from "../../../primitives/types";
import { cn } from "../../../../lib/cn";

export const APP_SIDEBAR_WIDTH_STORAGE_KEY = "movscript-sidebar-width";
export const APP_SIDEBAR_DEFAULT_WIDTH = 216;
export const APP_SIDEBAR_MIN_WIDTH = 176;
export const APP_SIDEBAR_MAX_WIDTH = 312;

export function clampAppSidebarWidth(width: number) {
  return Math.min(APP_SIDEBAR_MAX_WIDTH, Math.max(APP_SIDEBAR_MIN_WIDTH, width));
}

export function AppSidebarShell({
  collapsed = false,
  width = APP_SIDEBAR_DEFAULT_WIDTH,
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  collapsed?: boolean;
  width?: number;
}) {
  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={cn("app-sidebar", className)}
      style={collapsed ? style : { ...style, width }}
      {...props}
    />
  );
}

export function AppSidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("app-sidebar__header", className)} {...props} />;
}

export function AppSidebarTitle({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("app-sidebar__title", className)} {...props} />;
}

export function AppSidebarNav({
  collapsed = false,
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  collapsed?: boolean;
}) {
  return <nav data-collapsed={collapsed ? "true" : "false"} className={cn("app-sidebar__nav", className)} {...props} />;
}

export function AppSidebarDivider({
  collapsed = false,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  collapsed?: boolean;
}) {
  return <div data-collapsed={collapsed ? "true" : "false"} className={cn("app-sidebar__divider", className)} {...props} />;
}

export function AppSidebarSection({
  title,
  defaultOpen = true,
  collapsed = false,
  children,
  className,
}: {
  title: React.ReactNode;
  defaultOpen?: boolean;
  collapsed?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  if (collapsed) {
    return <div className={cn("app-sidebar-section app-sidebar-section--collapsed", className)}>{children}</div>;
  }

  return (
    <div className={cn("app-sidebar-section", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        className="app-sidebar-section__trigger"
      >
        {title}
        {open ? <ChevronDownIcon size={11} /> : <ChevronRightIcon size={11} />}
      </Button>
      {open ? <div className="app-sidebar-section__items">{children}</div> : null}
    </div>
  );
}

export function appSidebarNavItemClassName({
  active = false,
  collapsed = false,
  indent = false,
  className,
}: {
  active?: boolean;
  collapsed?: boolean;
  indent?: boolean;
  className?: string;
} = {}) {
  return cn(
    "app-sidebar-nav-item",
    active && "app-sidebar-nav-item--active",
    collapsed && "app-sidebar-nav-item--collapsed",
    indent && !collapsed && "app-sidebar-nav-item--indent",
    className,
  );
}

export function AppSidebarNavItemContent({
  icon: Icon,
  label,
  collapsed = false,
}: {
  icon: IconComponent;
  label: React.ReactNode;
  collapsed?: boolean;
}) {
  return (
    <>
      <Icon size={14} className="app-sidebar-nav-item__icon" />
      {!collapsed ? <span className="app-sidebar-nav-item__label">{label}</span> : null}
    </>
  );
}

export function AppSidebarNavItemFrame({
  active = false,
  collapsed = false,
  indent = false,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  collapsed?: boolean;
  indent?: boolean;
}) {
  return <div className={appSidebarNavItemClassName({ active, collapsed, indent, className })} {...props} />;
}

export function AppSidebarActionItem({
  icon,
  label,
  collapsed = false,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconComponent;
  label: React.ReactNode;
  collapsed?: boolean;
}) {
  return (
    <Button
      type="button"
      title={collapsed && typeof label === "string" ? label : undefined}
      variant="ghost"
      size="sm"
      className={appSidebarNavItemClassName({ collapsed, className })}
      {...props}
    >
      <AppSidebarNavItemContent icon={icon} label={label} collapsed={collapsed} />
    </Button>
  );
}

export function AppSidebarFooter({
  collapsed = false,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  collapsed?: boolean;
}) {
  return <div data-collapsed={collapsed ? "true" : "false"} className={cn("app-sidebar__footer", className)} {...props} />;
}

export function AppSidebarUserButton({
  collapsed = false,
  children,
  className,
}: {
  collapsed?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Button asChild variant="ghost" className={cn("app-sidebar-user-button", collapsed && "app-sidebar-user-button--collapsed", className)}>
      {children}
    </Button>
  );
}

export function AppSidebarUserMeta({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("app-sidebar-user-meta", className)} {...props} />;
}

export function AppSidebarUserButtonContent({
  collapsed = false,
  username,
  role,
}: {
  collapsed?: boolean;
  username: string;
  role?: React.ReactNode;
}) {
  return (
    <div className="app-sidebar-user-button__content" role="button" tabIndex={0} title={collapsed ? username : undefined}>
      <Avatar className="app-sidebar-user-button__avatar">
        <AvatarFallback className="app-sidebar-user-button__avatar-fallback">{username[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
      {!collapsed ? (
        <AppSidebarUserMeta>
          <span className="app-sidebar-user-meta__name">{username}</span>
          {role ? <span className="app-sidebar-user-meta__role">{role}</span> : null}
        </AppSidebarUserMeta>
      ) : null}
      {!collapsed ? <ChevronDownIcon size={12} className="app-sidebar-user-button__chevron" /> : null}
    </div>
  );
}

export function AppSidebarUserMenuContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof DropdownMenuContent>) {
  return <DropdownMenuContent align="start" className={cn("app-sidebar-user-menu", className)} {...props} />;
}

export function AppSidebarMenuLeadingIcon({ icon: Icon }: { icon: IconComponent }) {
  return <Icon size={14} className="app-sidebar-menu__leading-icon" />;
}

export function AppSidebarProjectRow({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("app-sidebar-project-row", className)} {...props} />;
}

export function AppSidebarProjectCurrent({
  icon: Icon,
  name,
  switchControl,
}: {
  icon: IconComponent;
  name: React.ReactNode;
  switchControl: React.ReactNode;
}) {
  return (
    <div className="app-sidebar-project-row__current">
      <Icon size={13} className="app-sidebar-project-row__icon" />
      <span className="app-sidebar-project-row__name">{name}</span>
      {switchControl}
    </div>
  );
}

export function AppSidebarProjectSwitch({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("app-sidebar-project-row__switch", className)} {...props} />;
}

export function AppSidebarProjectLinkContent({
  icon: Icon,
  children,
}: {
  icon: IconComponent;
  children: React.ReactNode;
}) {
  return (
    <span className="app-sidebar-project-row__link">
      <Icon size={13} className="app-sidebar-project-row__icon" />
      <span>{children}</span>
    </span>
  );
}
