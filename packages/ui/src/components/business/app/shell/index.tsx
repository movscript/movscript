import type { HTMLAttributes, ReactNode } from "react";

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
  icon: ReactNode;
  title: ReactNode;
  message: ReactNode;
  retryLabel: ReactNode;
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

export function AppBackendBootOverlay({
  icon,
  tone,
  title,
  description,
  baseURL,
  actions,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  icon: ReactNode;
  tone: "danger" | "info";
  title: ReactNode;
  description: ReactNode;
  baseURL: ReactNode;
  actions?: ReactNode;
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
        {actions ? <div className="ms-action-row app-backend-boot-card__actions">{actions}</div> : null}
      </AppSurfaceItem>
    </div>
  );
}

export function AppBackendBootActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("app-backend-boot-action", className)} {...props} />;
}
