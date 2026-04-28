"use client";

import * as React from "react";
import { cn } from "../lib/cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid = false, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn("ms-textarea", className)}
        aria-invalid={invalid || props["aria-invalid"] ? true : undefined}
        data-invalid={invalid ? "true" : undefined}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";

