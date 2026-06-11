"use client";

import * as React from "react";

import { cn } from "../../../../lib/cn";

export function AppWindowHeader({
  isMacOS = true,
  windowControls,
  leftControls,
  leftControlsLayout,
  controls,
  centerContent,
  fallbackBrand,
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  isMacOS?: boolean;
  windowControls?: React.ReactNode;
  leftControls?: React.ReactNode;
  leftControlsLayout?: "default" | "fill";
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
      {isMacOS && windowControls ? <div className="app-window-header__window-controls app-window-no-drag">{windowControls}</div> : null}
      {leftControls ? (
        <div
          className="app-window-header__left-controls app-window-no-drag"
          data-layout={leftControlsLayout === "fill" ? "fill" : undefined}
        >
          {leftControls}
        </div>
      ) : null}
      {!isMacOS && controls}
      {centerContent ? <div className="app-window-header__center">{centerContent}</div> : (fallbackBrand ?? <div className="app-window-header__spacer" />)}
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
      <div className={cn("app-window-brand-button", className)} aria-label="Movscript">
        {children}
      </div>
    </>
  );
}

export function AppWindowMacTrafficLights({
  focused = true,
  fullscreen = false,
  closeLabel = "Close",
  minimizeLabel = "Minimize",
  fullscreenLabel = "Enter fullscreen",
  restoreLabel = "Exit fullscreen",
  onClose,
  onMinimize,
  onToggleFullscreen,
  className,
}: {
  focused?: boolean;
  fullscreen?: boolean;
  closeLabel?: string;
  minimizeLabel?: string;
  fullscreenLabel?: string;
  restoreLabel?: string;
  onClose?: () => void;
  onMinimize?: () => void;
  onToggleFullscreen?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn("app-window-traffic-lights", className)}
      data-focused={focused ? "true" : "false"}
      data-fullscreen={fullscreen ? "true" : "false"}
    >
      <button
        type="button"
        className="app-window-traffic-light app-window-traffic-light--close"
        aria-label={closeLabel}
        title={closeLabel}
        onClick={onClose}
      >
        <span className="app-window-traffic-light__glyph app-window-traffic-light__glyph--close" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="app-window-traffic-light app-window-traffic-light--minimize"
        aria-label={minimizeLabel}
        title={minimizeLabel}
        onClick={onMinimize}
      >
        <span className="app-window-traffic-light__glyph app-window-traffic-light__glyph--minimize" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="app-window-traffic-light app-window-traffic-light--fullscreen"
        aria-label={fullscreen ? restoreLabel : fullscreenLabel}
        title={fullscreen ? restoreLabel : fullscreenLabel}
        onClick={onToggleFullscreen}
      >
        <span className="app-window-traffic-light__glyph app-window-traffic-light__glyph--fullscreen" aria-hidden="true" />
      </button>
    </div>
  );
}
