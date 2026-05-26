import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { KeyValue } from "../../../../primitives";

export function AppKeyValue({
  label,
  value,
  strong = false,
  className,
  valueClassName,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value?: ReactNode;
  strong?: boolean;
  valueClassName?: string;
}) {
  return (
    <KeyValue
      label={label}
      value={value ?? "-"}
      className={cn("app-key-value", className)}
      labelClassName="app-key-value__label"
      valueClassName={cn("app-key-value__value", strong && "app-key-value__value--strong", valueClassName)}
      {...props}
    />
  );
}
