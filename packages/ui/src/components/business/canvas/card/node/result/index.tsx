import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../../lib/cn";
import { StatusBadge, type StatusBadgeProps } from "../../../../../primitives";
import { AppMediaFrame, AppSurfaceItem } from "../../../../app";

export type CanvasNodeResultStatus = "idle" | "pending" | "running" | "done" | "failed";

export function CanvasNodeMediaResultView({
  status,
  media,
  emptyIcon,
  loadingIcon,
  error,
  failedLabel,
}: {
  status: CanvasNodeResultStatus;
  media?: ReactNode;
  emptyIcon: ReactNode;
  loadingIcon: ReactNode;
  error?: ReactNode;
  failedLabel: ReactNode;
}) {
  const running = status === "pending" || status === "running";
  if (status === "idle" && !media && !error) return null;
  return (
    <CanvasNodeResultPanel>
      {running ? (
        <CanvasNodeResultStage centered>
          {loadingIcon}
        </CanvasNodeResultStage>
      ) : status === "failed" ? (
        <CanvasNodeResultMessage tone="danger">
          {error ?? failedLabel}
        </CanvasNodeResultMessage>
      ) : media ? (
        <CanvasNodeResultStage>{media}</CanvasNodeResultStage>
      ) : (
        <CanvasNodeResultStage size="compact" centered>
          {emptyIcon}
        </CanvasNodeResultStage>
      )}
    </CanvasNodeResultPanel>
  );
}

export function CanvasNodeTextResultView({
  status,
  statusProps,
  statusLabel,
  prompt,
  loadingIcon,
  error,
  failedLabel,
  textContent,
}: {
  status: CanvasNodeResultStatus;
  statusProps?: StatusBadgeProps;
  statusLabel: ReactNode;
  prompt?: ReactNode;
  loadingIcon: ReactNode;
  error?: ReactNode;
  failedLabel: ReactNode;
  textContent?: ReactNode;
}) {
  const running = status === "pending" || status === "running";
  if (status === "idle" && !textContent && !error) return null;
  return (
    <CanvasNodeResultPanel>
      <CanvasNodeTextResultHeader
        statusProps={statusProps}
        statusLabel={statusLabel}
        prompt={prompt}
      />
      <CanvasNodeTextResultBody>
        {running ? (
          <CanvasNodeTextResultSurface state="loading">
            {loadingIcon}
          </CanvasNodeTextResultSurface>
        ) : status === "failed" ? (
          <CanvasNodeTextResultSurface state="danger">{error ?? failedLabel}</CanvasNodeTextResultSurface>
        ) : textContent ? (
          <CanvasNodeTextResultSurface>{textContent}</CanvasNodeTextResultSurface>
        ) : null}
      </CanvasNodeTextResultBody>
    </CanvasNodeResultPanel>
  );
}

export function CanvasNodeResultPanel({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <AppSurfaceItem className={cn("nodrag nowheel canvas-node-result-panel", className)} {...props}>
      {children}
    </AppSurfaceItem>
  );
}

export function CanvasNodeResultStage({
  size = "large",
  centered = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  size?: "large" | "compact";
  centered?: boolean;
  children: ReactNode;
}) {
  return (
    <AppMediaFrame
      variant="stage"
      data-size={size}
      data-centered={centered ? "true" : undefined}
      className={cn("canvas-node-result-stage", centered && "ms-center ms-type-label", className)}
      {...props}
    >
      {children}
    </AppMediaFrame>
  );
}

export function CanvasNodeResultMessage({
  tone = "neutral",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: "neutral" | "danger";
  children: ReactNode;
}) {
  return (
    <div data-tone={tone} className={cn("ms-center ms-type-label canvas-node-result-message", className)} {...props}>
      {children}
    </div>
  );
}

export function CanvasNodeTextResultHeader({
  statusProps,
  statusLabel,
  prompt,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  statusProps?: StatusBadgeProps;
  statusLabel: ReactNode;
  prompt?: ReactNode;
}) {
  const { className: statusClassName, ...statusVisualProps } = statusProps ?? {};

  return (
    <div className={cn("ms-stack canvas-node-text-result-header", className)} {...props}>
      <div className="ms-action-row canvas-node-text-result-header__status">
        <StatusBadge className={cn("ms-type-tiny canvas-node-text-result-badge", statusClassName)} {...statusVisualProps}>
          {statusLabel}
        </StatusBadge>
      </div>
      {prompt ? <p className="ms-type-label canvas-node-text-result-prompt">{prompt}</p> : null}
    </div>
  );
}

export function CanvasNodeTextResultBody({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <div className={cn("canvas-node-text-result-body", className)} {...props}>
      {children}
    </div>
  );
}

export function CanvasNodeTextResultSurface({
  asChild = false,
  state = "content",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  asChild?: boolean;
  state?: "content" | "loading" | "danger";
  children: ReactNode;
}) {
  return (
    <AppSurfaceItem
      asChild={asChild}
      variant={state === "danger" ? undefined : "muted"}
      data-state={state}
      className={cn("ms-type-label canvas-node-text-result-surface", state === "loading" && "ms-center", className)}
      {...props}
    >
      {children}
    </AppSurfaceItem>
  );
}
