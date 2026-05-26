"use client";

import * as React from "react";
import { cn } from "../../lib/cn";

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked = false, disabled = false, onCheckedChange, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        data-state={checked ? "checked" : "unchecked"}
        data-ms-component="Switch"
        data-ms-slot="root"
        className={cn("ms-switch", className)}
        {...props}
        onClick={(event) => {
          props.onClick?.(event);
          if (!event.defaultPrevented) onCheckedChange?.(!checked);
        }}
      >
        <span className="ms-switch__thumb" data-ms-component="Switch" data-ms-slot="thumb" />
      </button>
    );
  },
);

Switch.displayName = "Switch";
