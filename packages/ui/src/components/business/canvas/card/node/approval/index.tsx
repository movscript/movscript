import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { cn } from "../../../../../../lib/cn";
import { toneSurfaceClass, toneTextClass, type SemanticTone } from "../../../../../../semantic";
import { Button, type ButtonProps } from "../../../../../primitives";

export function CanvasNodeApprovalStatus({
  tone = "warning",
  compact = false,
  icon,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: SemanticTone;
  compact?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      data-compact={compact ? "true" : undefined}
      className={cn("canvas-node-approval-status", toneTextClass(tone), className)}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}

export function CanvasNodeApprovalActions({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <div className={cn("canvas-node-approval-actions", className)} {...props}>
      {children}
    </div>
  );
}

export const CanvasNodeApprovalActionButton = forwardRef<HTMLButtonElement, ButtonProps & {
  actionTone?: SemanticTone;
}>(({ actionTone = "neutral", className, variant = "ghost", size = "xs", type = "button", ...props }, ref) => (
  <Button
    ref={ref}
    type={type}
    variant={variant}
    size={size}
    className={cn("canvas-node-approval-action-button", toneSurfaceClass(actionTone), toneTextClass(actionTone), className)}
    {...props}
  />
));

CanvasNodeApprovalActionButton.displayName = "CanvasNodeApprovalActionButton";
