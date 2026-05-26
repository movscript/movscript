import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { Button, type ButtonProps } from "../../../primitives";
import { AppMarkerDot } from "../../app";

export function CanvasSelectionFrame({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-selection-frame", className)} {...props} />;
}

export function CanvasDropOverlay({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-drop-overlay", className)} {...props} />;
}

export function CanvasGroupFrame({
  selected = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  selected?: boolean;
}) {
  return <div data-selected={selected ? "true" : undefined} className={cn("canvas-group-frame", className)} {...props} />;
}

export function CanvasGroupHeader({
  marker = <AppMarkerDot tone="brand" size="xs" />,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  marker?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("canvas-group-header", className)} {...props}>
      {marker}
      <span className="canvas-group-header__title">{children}</span>
    </div>
  );
}

export const CanvasViewportActionButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "outline", size = "sm", ...props }, ref) => {
    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        className={cn("nodrag nopan canvas-viewport-action-button", className)}
        {...props}
      />
    );
  }
);

CanvasViewportActionButton.displayName = "CanvasViewportActionButton";

export const CanvasResizeHandleButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "ghost", size = "icon-xs", type = "button", children, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        type={type}
        variant={variant}
        size={size}
        className={cn("canvas-resize-handle-button", className)}
        {...props}
      >
        {children ?? <span className="canvas-resize-handle-button__bar" />}
      </Button>
    );
  }
);

CanvasResizeHandleButton.displayName = "CanvasResizeHandleButton";
