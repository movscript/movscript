import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { cn } from '@movscript/ui/primitives';
import { toneSurfaceClass, toneTextClass, type SemanticTone } from "@movscript/ui/semantic";
import {
  Button,
  Textarea,
  type ButtonProps,
  type TextareaProps,
} from "@movscript/ui/primitives";
import {
  CanvasCardShell,
} from "@movscript/ui/business/canvas";
import "./CanvasNodeCardUi.css";

export function CanvasNodeCard({
  selected,
  contentMode,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  selected?: boolean;
  contentMode?: "text";
  children: ReactNode;
}) {
  return (
    <CanvasCardShell
      selected={selected}
      data-content-mode={contentMode}
      className={cn("canvas-node-card", className)}
      {...props}
    >
      {children}
    </CanvasCardShell>
  );
}

export function CanvasNodeCardHeader({
  icon,
  label,
  tone,
  status,
  actions,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon: ReactNode;
  label: ReactNode;
  tone?: SemanticTone;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={cn("canvas-node-card-header", tone ? toneSurfaceClass(tone) : undefined, className)} {...props}>
      <span className="canvas-node-card-header__icon">{icon}</span>
      <span className="canvas-node-card-header__label">{label}</span>
      {status}
      {actions}
    </div>
  );
}

export const CanvasNodeCardActionButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "ghost", size = "icon-xs", type = "button", ...props }, ref) => {
    return (
      <Button
        ref={ref}
        type={type}
        variant={variant}
        size={size}
        className={cn("canvas-node-card-action-button", className)}
        {...props}
      />
    );
  }
);

CanvasNodeCardActionButton.displayName = "CanvasNodeCardActionButton";

export function CanvasNodeCardBody({
  scrollable = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  scrollable?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-scrollable={scrollable ? "true" : undefined}
      className={cn("canvas-node-card-body", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export const CanvasNodeCardTextarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant = "subtle", ...props }, ref) => {
    return (
      <Textarea
        ref={ref}
        variant={variant}
        className={cn("nodrag nowheel canvas-node-card-textarea", className)}
        {...props}
      />
    );
  }
);

CanvasNodeCardTextarea.displayName = "CanvasNodeCardTextarea";

export function CanvasNodeCardPreviewText({
  empty = false,
  clampLines,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  empty?: boolean;
  clampLines?: 4;
  children: ReactNode;
}) {
  return (
    <span
      data-empty={empty ? "true" : undefined}
      data-clamp-lines={clampLines}
      className={cn("canvas-node-card-preview-text", className)}
      {...props}
    >
      {children}
    </span>
  );
}

export function CanvasNodeFrame({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <div className={cn("canvas-node-frame", className)} {...props}>
      {children}
    </div>
  );
}

export function CanvasNodeStatusPip({
  tone,
  spinning = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone: Extract<SemanticTone, "success" | "warning" | "danger">;
  spinning?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      data-spinning={spinning ? "true" : undefined}
      className={cn("canvas-node-status-pip", toneTextClass(tone), className)}
      {...props}
    >
      {children}
    </span>
  );
}

export type CanvasNodeStatusPipViewStatus = "idle" | "pending" | "running" | "done" | "failed" | string;

export function CanvasNodeStatusPipView({
  status,
  pendingIcon,
  doneIcon,
  failedIcon,
}: {
  status: CanvasNodeStatusPipViewStatus;
  pendingIcon: ReactNode;
  doneIcon: ReactNode;
  failedIcon: ReactNode;
}) {
  if (status === "running" || status === "pending") {
    return <CanvasNodeStatusPip tone="warning" spinning>{pendingIcon}</CanvasNodeStatusPip>;
  }
  if (status === "done") return <CanvasNodeStatusPip tone="success">{doneIcon}</CanvasNodeStatusPip>;
  if (status === "failed") return <CanvasNodeStatusPip tone="danger">{failedIcon}</CanvasNodeStatusPip>;
  return null;
}

export type CanvasNodeStatusIcons = {
  pendingIcon: ReactNode;
  doneIcon: ReactNode;
  failedIcon: ReactNode;
};

export function CanvasMediaNodeInfo({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <div className={cn("canvas-media-node-info", className)} {...props}>
      {children}
    </div>
  );
}

export function CanvasMediaNodeInfoCrumbs({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-media-node-info__crumbs", className)} {...props} />;
}

export function CanvasMediaNodeInfoCrumb({
  name = false,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  name?: boolean;
}) {
  return <span className={cn("canvas-media-node-info__crumb", name ? "canvas-media-node-info__name" : undefined, className)} {...props} />;
}

export function CanvasMediaNodeInfoProbe({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("canvas-media-node-info__probe", className)} {...props} />;
}

export function CanvasNodeFooterText({
  tone = "neutral",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  tone?: Extract<SemanticTone, "neutral" | "danger">;
  children: ReactNode;
}) {
  return (
    <p data-tone={tone} className={cn("canvas-node-footer-text", tone === "danger" ? toneTextClass("danger") : undefined, className)} {...props}>
      {children}
    </p>
  );
}
