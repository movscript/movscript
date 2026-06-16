import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

import { cn } from "../../../../../lib/cn";
import { AppSurfaceItem } from "../../../app";
import { Button } from "../../../../primitives/button";

export function ResourceAssetSlotCard({
  selected = false,
  clickable = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  selected?: boolean;
  clickable?: boolean;
}) {
  return (
    <AppSurfaceItem
      data-selected={selected ? "true" : undefined}
      data-clickable={clickable ? "true" : undefined}
      className={cn("resource-panel-asset-slot", className)}
      {...props}
    />
  );
}

export function ResourceAssetSlotHeader({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ms-action-row resource-panel-asset-slot__header", className)} {...props}>
      {children}
    </div>
  );
}

export function ResourceAssetSlotBody({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("resource-panel-asset-slot__body", className)} {...props}>
      {children}
    </div>
  );
}

export function ResourceAssetSlotTitle({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("ms-text-truncate ms-type-label resource-panel-asset-slot__title", className)} {...props}>
      {children}
    </p>
  );
}

export function ResourceAssetSlotMeta({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("ms-text-truncate ms-type-tiny resource-panel-asset-slot__meta", className)} {...props}>
      {children}
    </p>
  );
}

export const ResourceAssetSlotDragButton = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & {
  selected?: boolean;
}>(({ selected = false, className, children, ...props }, ref) => (
  <Button
    asChild
    variant="ghost"
    size="icon-sm"
    data-selected={selected ? "true" : undefined}
    className={cn("resource-panel-asset-slot__drag", className)}
  >
    <div ref={ref} {...props}>
      {children}
    </div>
  </Button>
));

ResourceAssetSlotDragButton.displayName = "ResourceAssetSlotDragButton";
