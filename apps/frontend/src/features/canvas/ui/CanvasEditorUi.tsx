import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/shared/ui/cn";
import { AppEmptyState, AppIconFrame, AppMarkerDot, AppSurfaceItem } from "@movscript/ui/business/app";
import {
  Badge,
  Button,
  Input,
  StatusBadge,
  type ButtonProps,
  type InputProps,
  type IconComponent,
} from "@movscript/ui/primitives";

import "./CanvasEditorUi.css";
export * from "./CanvasEditorPaletteUi";

export const canvasFlowClassName = "canvas-flow";
export const canvasFlowBackgroundColor = "var(--ui-canvas-flow-background-color)" as const;

export function CanvasEditorShell({
  embedded = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  embedded?: boolean;
}) {
  return <div data-embedded={embedded ? "true" : undefined} className={cn("canvas-editor", className)} {...props} />;
}

export function CanvasEditorChrome({
  embedded = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  embedded?: boolean;
}) {
  return (
    <AppSurfaceItem
      variant="muted"
      data-embedded={embedded ? "true" : undefined}
      className={cn("canvas-editor-chrome", className)}
      {...props}
    />
  );
}

export function CanvasEditorChromeContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-editor-chrome__content", className)} {...props} />;
}

export function CanvasEditorTitleArea({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-editor-chrome__title-area", className)} {...props} />;
}

export function CanvasEditorTitleRow({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-editor-chrome__title-row", className)} {...props} />;
}

export const CanvasEditorNameInput = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <Input ref={ref} className={cn("canvas-editor-chrome__name-input", className)} {...props} />
  )
);

CanvasEditorNameInput.displayName = "CanvasEditorNameInput";

export const CanvasEditorNameButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn("canvas-editor-chrome__name-button", className)} {...props} />
  )
);

CanvasEditorNameButton.displayName = "CanvasEditorNameButton";

export function CanvasEditorTypeBadge({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Badge variant="outline" className={cn("canvas-editor-chrome__type-badge", className)} {...props}>
      {icon ? <span className="canvas-editor-chrome__badge-icon">{icon}</span> : null}
      {children}
    </Badge>
  );
}

export function CanvasEditorMetricBadge({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Badge variant="outline" className={cn("canvas-editor-chrome__metric-badge", className)} {...props}>
      {icon ? <span className="canvas-editor-chrome__badge-icon">{icon}</span> : null}
      {children}
    </Badge>
  );
}

export function CanvasEditorRunningBadge({
  icon,
  children,
  loading = false,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  icon?: ReactNode;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <Badge data-loading={loading ? "true" : undefined} className={cn("canvas-editor-chrome__running-badge", className)} {...props}>
      {icon ? <span className="canvas-editor-chrome__badge-icon">{icon}</span> : null}
      {children}
    </Badge>
  );
}

export function CanvasEditorStatusBadge({
  icon,
  children,
  loading = false,
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  icon?: ReactNode;
  loading?: boolean;
  tone?: "neutral" | "success" | "danger" | "warning" | "info";
  children: ReactNode;
}) {
  return (
    <StatusBadge
      tone={tone}
      data-loading={loading ? "true" : undefined}
      className={cn("canvas-editor-chrome__status-badge", className)}
      {...props}
    >
      {icon ? <span className="canvas-editor-chrome__badge-icon">{icon}</span> : null}
      {children}
    </StatusBadge>
  );
}

export function CanvasEditorStats({
  items,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  items: ReactNode[];
}) {
  return (
    <div className={cn("canvas-editor-chrome__stats", className)} {...props}>
      {items.map((item, index) => (
        <span className="canvas-editor-chrome__stat-fragment" key={index}>
          {index > 0 ? <AppMarkerDot tone="border" size="2xs" /> : null}
          <span className="canvas-editor-chrome__stat">{item}</span>
        </span>
      ))}
    </div>
  );
}

export const CanvasEditorIconButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "ghost", size = "icon-sm", ...props }, ref) => (
    <Button ref={ref} variant={variant} size={size} className={cn("canvas-editor-chrome__icon-button", className)} {...props} />
  )
);

CanvasEditorIconButton.displayName = "CanvasEditorIconButton";

export const CanvasEditorActionButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size = "sm", ...props }, ref) => (
    <Button ref={ref} size={size} className={cn("canvas-editor-chrome__action-button", className)} {...props} />
  )
);

CanvasEditorActionButton.displayName = "CanvasEditorActionButton";

export function CanvasEditorMain({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-editor__main", className)} {...props} />;
}

export function CanvasEditorContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-editor__content", className)} {...props} />;
}

export const CanvasViewportPane = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & {
  dropActive?: boolean;
}>(({ dropActive = false, className, ...props }, ref) => (
  <div
    ref={ref}
    data-drop-active={dropActive ? "true" : undefined}
    className={cn("canvas-viewport-pane", className)}
    {...props}
  />
));

CanvasViewportPane.displayName = "CanvasViewportPane";

export const CanvasViewportSelectionActionButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size = "sm", ...props }, ref) => (
    <Button
      ref={ref}
      size={size}
      className={cn("nodrag nopan canvas-viewport-selection-action", className)}
      {...props}
    />
  )
);

CanvasViewportSelectionActionButton.displayName = "CanvasViewportSelectionActionButton";

export function CanvasViewportBoundsLayer({
  x,
  y,
  width,
  height,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return (
    <div
      className={cn("canvas-viewport-bounds-layer", className)}
      style={{
        ...style,
        transform: `translate(${x}px, ${y}px)`,
        width,
        height,
      }}
      {...props}
    />
  );
}

export function CanvasViewportEmptyOverlay({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-viewport-empty-overlay", className)} {...props} />;
}

export function CanvasViewportOverlayLayer({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-viewport-overlay-layer", className)} {...props} />;
}

export function CanvasViewportEmptyState({
  icon,
  title,
  detail,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: IconComponent;
  title: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <AppEmptyState
      icon={icon}
      title={title}
      detail={detail}
      className={cn("canvas-viewport-empty-state", className)}
      {...props}
    />
  );
}

export function CanvasViewportStatusOverlay({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AppSurfaceItem variant="overlay" className={cn("canvas-viewport-status", className)} {...props}>
      {icon ? <span className="canvas-viewport-status__icon">{icon}</span> : null}
      <span className="canvas-viewport-status__label">{children}</span>
    </AppSurfaceItem>
  );
}
