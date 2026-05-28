"use client";

import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes } from "react";

import { toneSurfaceClass, toneTextClass } from "../../../../semantic";
import { cn } from "../../../../lib/cn";
import { AppCodeBlock } from "../display";
import { AppSurfaceItem } from "../surface/item";
import { Button } from "../../../primitives";

export type AppToastTone = "success" | "danger" | "info";

export interface AppToastShellProps extends HTMLAttributes<HTMLDivElement> {
  tone?: AppToastTone;
}

export const AppToastShell = forwardRef<HTMLDivElement, AppToastShellProps>(
  ({ tone = "info", className, children, ...props }, ref) => (
    <AppSurfaceItem
      ref={ref}
      variant="overlay"
      className={cn("app-toast", toneSurfaceClass(tone), className)}
      {...props}
    >
      {children}
    </AppSurfaceItem>
  ),
);

AppToastShell.displayName = "AppToastShell";

export function AppToastRow({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("app-toast__row", className)} {...props}>
      {children}
    </div>
  );
}

export function AppToastIcon({
  tone = "info",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: AppToastTone;
}) {
  return (
    <span className={cn("app-toast__icon", toneTextClass(tone), className)} {...props}>
      {children}
    </span>
  );
}

export const AppToastMessage = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("app-toast__message", className)} {...props}>
      {children}
    </div>
  ),
);

AppToastMessage.displayName = "AppToastMessage";

export function AppToastDetail({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLPreElement>) {
  return (
    <AppCodeBlock className={cn("app-toast__detail", className)} {...props}>
      {children}
    </AppCodeBlock>
  );
}

export const AppToastIconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, children, ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="icon-xs"
      className={cn("app-toast__button", className)}
      {...props}
    >
      {children}
    </Button>
  )
);

AppToastIconButton.displayName = "AppToastIconButton";

export const AppToastViewport = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("app-toast-viewport", className)} {...props} />,
);

AppToastViewport.displayName = "AppToastViewport";
