"use client";

import * as React from "react";

import { AsChildSlot } from "../../../../lib/asChild";
import { cn } from "../../../../lib/cn";
import type { IconComponent } from "../../../primitives/types";

export function AppPrimaryNav({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return <nav className={cn("app-primary-nav", className)} {...props} />;
}

export const AppPrimaryNavItem = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & {
  active?: boolean;
  asChild?: boolean;
}>(({
  active = false,
  asChild = false,
  className,
  ...props
}, ref) => {
  const itemProps = {
    dataActive: active ? "true" : "false",
    className: cn("app-primary-nav-item", className),
  } as const;

  if (asChild) {
    return (
      <AsChildSlot
        ref={ref as React.Ref<HTMLElement>}
        fallback="a"
        data-active={itemProps.dataActive}
        className={itemProps.className}
        {...props}
      />
    );
  }

  return (
    <a
      ref={ref as React.Ref<HTMLAnchorElement>}
      data-active={itemProps.dataActive}
      className={itemProps.className}
      {...props as React.AnchorHTMLAttributes<HTMLAnchorElement>}
    />
  );
});

AppPrimaryNavItem.displayName = "AppPrimaryNavItem";

export function AppPrimaryNavItemContent({
  icon: Icon,
  label,
}: {
  icon: IconComponent;
  label: React.ReactNode;
}) {
  return (
    <>
      <Icon size={15} className="app-primary-nav-item__icon" />
      <span className="app-primary-nav-item__label">{label}</span>
    </>
  );
}
