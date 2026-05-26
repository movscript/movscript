import type { HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

import { cn } from "../../../../../lib/cn";
import { AppMediaFrame, AppSurfaceItem } from "../../../app";
import { Button, type ButtonProps } from "../../../../primitives/button";
import { XIcon } from "../../../../primitives/icons";

export function ToolResourceGrid({ children, hint, className, ...props }: HTMLAttributes<HTMLDivElement> & { hint?: ReactNode }) {
  return (
    <>
      <div className={cn("tool-resource-grid", className)} {...props}>
        {children}
      </div>
      {hint ? <p className="tool-resource-grid__hint">{hint}</p> : null}
    </>
  );
}

export function ToolResourceTile({
  media,
  name,
  removeAction,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  media: ReactNode;
  name: ReactNode;
  removeAction?: ReactNode;
}) {
  return (
    <div className={cn("tool-resource-tile", className)} {...props}>
      <AppMediaFrame variant="thumb" className="tool-resource-tile__media">
        {media}
      </AppMediaFrame>
      {removeAction}
      <p className="tool-resource-tile__name">{name}</p>
    </div>
  );
}

export const ToolResourceRemoveButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, children, ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant="outline"
      size="icon-xs"
      className={cn("tool-resource-tile__remove", className)}
      {...props}
    >
      {children ?? <XIcon size={10} />}
    </Button>
  )
);

ToolResourceRemoveButton.displayName = "ToolResourceRemoveButton";

export function ToolUploadTile({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <AppSurfaceItem asChild variant="muted" className={cn("tool-upload-tile", className)} {...props}>
      {children}
    </AppSurfaceItem>
  );
}

export const ToolHiddenFileInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "file", ...props }, ref) => (
    <input ref={ref} type={type} className={cn("tool-hidden-input", className)} {...props} />
  )
);

ToolHiddenFileInput.displayName = "ToolHiddenFileInput";
