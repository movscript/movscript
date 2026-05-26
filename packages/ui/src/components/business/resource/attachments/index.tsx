import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

import { cn } from "../../../../lib/cn";
import { Button, type ButtonProps } from "../../../primitives/button";
import { AppMediaFrame, AppSurfaceItem } from "../../app";

export function ResourceAttachmentRoot({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("resource-attachments", className)} {...props}>
      {children}
    </div>
  );
}

export function ResourceAttachmentGrid({
  children,
  variant = "picker",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: "picker" | "gallery";
}) {
  return (
    <div data-variant={variant} className={cn("resource-attachments__grid", className)} {...props}>
      {children}
    </div>
  );
}

export function ResourceAttachmentTile({
  children,
  name,
  removeAction,
  variant = "picker",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  name?: ReactNode;
  removeAction?: ReactNode;
  variant?: "picker" | "gallery";
}) {
  return (
    <div data-variant={variant} className={cn("resource-attachment-tile", className)} {...props}>
      <AppMediaFrame variant="thumb" className="resource-attachment-tile__media">
        {children}
      </AppMediaFrame>
      {variant === "gallery" && name ? (
        <AppSurfaceItem variant="overlay" className="resource-attachment-tile__name-overlay">
          <p>{name}</p>
        </AppSurfaceItem>
      ) : null}
      {removeAction}
    </div>
  );
}

export function ResourceAttachmentFallback({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("resource-attachment-fallback", className)} {...props}>
      {children}
    </div>
  );
}

export const ResourceAttachmentRemoveButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, children, ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      size="icon-xs"
      variant="solid"
      tone="danger"
      className={cn("resource-attachment-remove", className)}
      {...props}
    >
      {children}
    </Button>
  )
);

ResourceAttachmentRemoveButton.displayName = "ResourceAttachmentRemoveButton";

export const ResourceAttachmentActionTile = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  label: ReactNode;
  variant?: "picker" | "gallery";
}>(({ icon, label, variant = "picker", className, ...props }, ref) => (
  <Button
    ref={ref}
    type="button"
    variant="outline"
    data-variant={variant}
    className={cn("resource-attachment-action-tile", className)}
    {...props}
  >
    {icon}
    <span>{label}</span>
  </Button>
));

ResourceAttachmentActionTile.displayName = "ResourceAttachmentActionTile";

export const ResourceAttachmentHiddenInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "file", ...props }, ref) => (
    <input ref={ref} type={type} className={cn("resource-attachment-hidden-input", className)} {...props} />
  )
);

ResourceAttachmentHiddenInput.displayName = "ResourceAttachmentHiddenInput";
