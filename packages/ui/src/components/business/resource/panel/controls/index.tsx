import type { HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

import { cn } from "../../../../../lib/cn";
import { AppControlGroup } from "../../../app";
import { Button, type ButtonProps } from "../../../../primitives/button";
import { Input, type InputProps } from "../../../../primitives/input";
import { NativeSelect, type NativeSelectProps } from "../../../../primitives/select";

export const ResourcePanelTabButton = forwardRef<HTMLButtonElement, ButtonProps & {
  active?: boolean;
}>(({ active = false, className, ...props }, ref) => (
  <Button
    ref={ref}
    type="button"
    variant={active ? "soft" : "ghost"}
    size="sm"
    data-active={active ? "true" : undefined}
    className={cn("ms-type-label resource-panel__tab", className)}
    {...props}
  />
));

ResourcePanelTabButton.displayName = "ResourcePanelTabButton";

export const ResourcePanelSearchField = forwardRef<HTMLInputElement, InputProps & {
  icon?: ReactNode;
}>(({ icon, className, ...props }, ref) => (
  <div className="resource-panel-search">
    {icon ? <span className="ms-inline-center resource-panel-search__icon">{icon}</span> : null}
    <Input ref={ref} className={cn("ms-type-label resource-panel-search__input", className)} {...props} />
  </div>
));

ResourcePanelSearchField.displayName = "ResourcePanelSearchField";

export function ResourcePanelSegmentGroup({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <AppControlGroup layout="grid" className={cn("resource-panel-segments", className)} {...props}>
      {children}
    </AppControlGroup>
  );
}

export const ResourcePanelSegmentButton = forwardRef<HTMLButtonElement, ButtonProps & {
  active?: boolean;
}>(({ active = false, className, ...props }, ref) => (
  <Button
    ref={ref}
    type="button"
    variant={active ? "solid" : "ghost"}
    size="xs"
    className={cn("ms-type-caption resource-panel-segments__button", className)}
    {...props}
  />
));

ResourcePanelSegmentButton.displayName = "ResourcePanelSegmentButton";

export const ResourcePanelSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, controlSize = "sm", ...props }, ref) => (
    <NativeSelect ref={ref} controlSize={controlSize} className={cn("ms-type-label resource-panel__select", className)} {...props} />
  )
);

ResourcePanelSelect.displayName = "ResourcePanelSelect";
