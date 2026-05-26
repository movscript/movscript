import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { cn } from "../../../../../../lib/cn";
import { Button, type ButtonProps } from "../../../../../primitives";
import { AppInlineMeta } from "../../../../app";

export function CanvasNodeAttachmentList({
  empty = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  empty?: boolean;
  children: ReactNode;
}) {
  return (
    <div data-empty={empty ? "true" : undefined} className={cn("canvas-node-attachment-list", className)} {...props}>
      {children}
    </div>
  );
}

export function CanvasNodeAttachmentItem({
  media,
  label,
  trailing,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  media: ReactNode;
  label: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <AppInlineMeta asChild className={cn("canvas-node-attachment-item", className)}>
      <div {...props}>
        {media}
        <span className="canvas-node-attachment-item__label">{label}</span>
        {trailing}
      </div>
    </AppInlineMeta>
  );
}

export const CanvasNodeAttachmentRemoveButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "ghost", size = "icon-xs", type = "button", ...props }, ref) => (
    <Button
      ref={ref}
      type={type}
      variant={variant}
      size={size}
      className={cn("canvas-node-attachment-remove", className)}
      {...props}
    />
  )
);

CanvasNodeAttachmentRemoveButton.displayName = "CanvasNodeAttachmentRemoveButton";

export function CanvasNodeAttachmentStatus({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
}) {
  return (
    <span className={cn("canvas-node-attachment-status", className)} {...props}>
      {children}
    </span>
  );
}

export function CanvasNodeAttachmentHint({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <div className={cn("canvas-node-attachment-hint", className)} {...props}>
      {children}
    </div>
  );
}
