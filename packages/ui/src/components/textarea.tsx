"use client";

import * as React from "react";
import { cn } from "../lib/cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  variant?: "default" | "subtle";
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid = false, variant = "default", ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn("ms-field-control ms-textarea", className)}
        aria-invalid={invalid || props["aria-invalid"] ? true : undefined}
        data-invalid={invalid ? "true" : undefined}
        data-variant={variant}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";
