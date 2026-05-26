"use client";

import * as React from "react";

import { Button } from "../../../primitives/button";
import { cn } from "../../../../lib/cn";

export function AppWindowHeader({
  isMacOS = true,
  leftControls,
  controls,
  centerContent,
  fallbackBrand,
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  isMacOS?: boolean;
  leftControls?: React.ReactNode;
  controls?: React.ReactNode;
  centerContent?: React.ReactNode;
  fallbackBrand?: React.ReactNode;
}) {
  return (
    <header
      className={cn(
        "app-window-header",
        isMacOS ? "app-window-header--mac" : "app-window-header--controls-right",
        className,
      )}
      {...props}
    >
      {leftControls ? <div className="app-window-header__left-controls app-window-no-drag">{leftControls}</div> : null}
      {!isMacOS && controls}
      {centerContent ? <div className="app-window-header__center">{centerContent}</div> : fallbackBrand}
      {isMacOS && controls}
    </header>
  );
}

export function AppWindowControls({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("app-window-controls app-window-no-drag", className)} {...props} />;
}

export function AppWindowBrandButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <>
      <div className="app-window-header__spacer" />
      <Button asChild variant="ghost" size="sm" className={cn("app-window-brand-button app-window-no-drag", className)}>
        {children}
      </Button>
    </>
  );
}
