import * as React from "react";

import { AsChildSlot } from "../../../../lib/asChild";
import { cn } from "../../../../lib/cn";
import { Button, type ButtonProps } from "../../../primitives";
import { AppIconFrame, AppInlineMeta } from "../display";
import { AppSurfaceItem } from "../surface";

export function AppErrorFallback({
  icon,
  title,
  message,
  retryLabel,
  onRetry,
  className,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  message: React.ReactNode;
  retryLabel: React.ReactNode;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div className={cn("ms-stack ms-center app-error-fallback", className)}>
      <AppIconFrame size="lg" tone="danger">
        {icon}
      </AppIconFrame>
      <div className="app-error-fallback__copy">
        <p className="ms-type-body app-error-fallback__title">{title}</p>
        <p className="ms-type-label app-error-fallback__message">{message}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}

export function AppHostChrome({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("app-host-chrome", className)} {...props} />;
}

export function AppHostChromeTopbar({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return <header className={cn("app-host-chrome__topbar", className)} {...props} />;
}

export const AppHostChromeBrand = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & {
  asChild?: boolean;
}>(({
  asChild = false,
  className,
  ...props
}, ref) => {
  if (asChild) {
    return (
      <AsChildSlot
        ref={ref}
        fallback="a"
        className={cn("app-host-chrome__brand", className)}
        {...props}
      />
    );
  }

  return (
    <a
      ref={ref as React.Ref<HTMLAnchorElement>}
      className={cn("app-host-chrome__brand", className)}
      {...props as React.AnchorHTMLAttributes<HTMLAnchorElement>}
    />
  );
});

AppHostChromeBrand.displayName = "AppHostChromeBrand";

export function AppHostChromeBrandMark({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("app-host-chrome__brand-mark", className)} {...props} />;
}

export function AppHostChromeBrandCopy({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("app-host-chrome__brand-copy", className)} {...props} />;
}

export function AppHostChromeActions({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("app-host-chrome__actions", className)} {...props} />;
}

export function AppHostChromeWorkspace({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("app-host-chrome__workspace", className)} {...props} />;
}

export function AppHostChromeMain({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return <main className={cn("app-host-chrome__main", className)} {...props} />;
}

export function AppHostChromeStatus({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("app-host-chrome-status", className)} {...props} />;
}

export function AppHostChromePreferences({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("app-host-chrome-preferences", className)} {...props} />;
}

export function AppHostChromeActionLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("app-host-chrome-action-label", className)} {...props} />;
}

export function AppBackendBootOverlay({
  icon,
  tone,
  title,
  description,
  baseURL,
  progress,
  details,
  actions,
  className,
}: React.HTMLAttributes<HTMLDivElement> & {
  icon: React.ReactNode;
  tone: "danger" | "info";
  title: React.ReactNode;
  description: React.ReactNode;
  baseURL: React.ReactNode;
  progress?: React.ReactNode;
  details?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className={cn("ms-center app-backend-boot-overlay", className)}>
      <AppSurfaceItem className="app-backend-boot-card">
        <AppIconFrame size="lg" tone={tone} className="app-backend-boot-card__icon">
          {icon}
        </AppIconFrame>
        <h2 className="ms-type-body app-backend-boot-card__title">{title}</h2>
        <p className="ms-type-label app-backend-boot-card__description">{description}</p>
        <AppInlineMeta className="app-backend-boot-card__meta">
          {baseURL}
        </AppInlineMeta>
        {progress ? <div className="app-backend-boot-card__progress">{progress}</div> : null}
        {details ? <div className="app-backend-boot-card__details">{details}</div> : null}
        {actions ? <div className="ms-action-row app-backend-boot-card__actions">{actions}</div> : null}
      </AppSurfaceItem>
    </div>
  );
}

export function AppBackendBootActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("app-backend-boot-action", className)} {...props} />;
}
