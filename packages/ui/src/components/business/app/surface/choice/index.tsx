import { forwardRef } from "react";

import { cn } from "../../../../../lib/cn";
import { Button, type ButtonProps } from "../../../../primitives";

export const AppChoiceTile = forwardRef<HTMLButtonElement, ButtonProps & { selected?: boolean }>(
  ({ selected = false, className, variant, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        variant={variant ?? (selected ? "solid" : "ghost")}
        data-selected={selected ? "true" : undefined}
        className={cn("app-choice-tile", className)}
        {...props}
      />
    );
  }
);

AppChoiceTile.displayName = "AppChoiceTile";
