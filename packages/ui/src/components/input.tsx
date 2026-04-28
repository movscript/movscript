"use client";

import * as React from "react";
import { cn } from "../lib/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid = false, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn("ms-input", className)}
        aria-invalid={invalid || props["aria-invalid"] ? true : undefined}
        data-invalid={invalid ? "true" : undefined}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

