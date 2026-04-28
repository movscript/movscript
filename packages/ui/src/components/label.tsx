"use client";

import * as React from "react";
import { cn } from "../lib/cn";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required = false, children, ...props }, ref) => {
    return (
      <label ref={ref} className={cn("ms-label", className)} {...props}>
        <span>{children}</span>
        {required ? <span className="ms-label__required" aria-hidden="true">*</span> : null}
      </label>
    );
  }
);

Label.displayName = "Label";
