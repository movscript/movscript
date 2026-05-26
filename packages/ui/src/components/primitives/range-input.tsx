"use client";

import * as React from "react";
import { cn } from "../../lib/cn";

export interface RangeInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: number;
}

export const RangeInput = React.forwardRef<HTMLInputElement, RangeInputProps>(
  ({ className, value, min = 0, max = 100, style, ...props }, ref) => {
    const minValue = Number(min);
    const maxValue = Number(max);
    const progress = maxValue > minValue ? ((Number(value) - minValue) / (maxValue - minValue)) * 100 : 0;

    return (
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        value={value}
        data-ms-component="RangeInput"
        data-ms-slot="root"
        className={cn("ms-range-input", className)}
        style={{ "--ui-range-progress": `${Math.min(100, Math.max(0, progress))}%`, ...style } as React.CSSProperties}
        {...props}
      />
    );
  },
);

RangeInput.displayName = "RangeInput";
