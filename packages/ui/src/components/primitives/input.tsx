"use client";

import * as React from "react";
import { cn } from "../../lib/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  controlSize?: "sm" | "default";
  variant?: "default" | "subtle";
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid = false, controlSize = "default", variant = "default", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn("ms-field-control ms-input", className)}
        aria-invalid={invalid || props["aria-invalid"] ? true : undefined}
        data-invalid={invalid ? "true" : undefined}
        data-size={controlSize}
        data-variant={variant}
        data-ms-component="Input"
        data-ms-slot="root"
        data-ms-size={controlSize}
        data-ms-variant={variant}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
