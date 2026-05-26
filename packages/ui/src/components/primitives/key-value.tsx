"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { Surface } from "./surface";

export interface KeyValueProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  labelClassName?: string;
  valueClassName?: string;
}

export const KeyValue = React.forwardRef<HTMLDivElement, KeyValueProps>(
  ({ label, value, className, labelClassName, valueClassName, ...props }, ref) => (
    <Surface
      ref={ref}
      kind="item"
      density="compact"
      emphasis="unframed"
      className={cn("ms-key-value", className)}
      {...props}
    >
      <p className={cn("ms-key-value__label", labelClassName)}>{label}</p>
      <p className={cn("ms-key-value__value", valueClassName)}>{value}</p>
    </Surface>
  ),
);

KeyValue.displayName = "KeyValue";
