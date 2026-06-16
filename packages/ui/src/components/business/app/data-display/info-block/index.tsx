import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { AppSurfaceItem } from "../../surface/item";

export function AppInfoBlock({
  label,
  value,
  surface = "plain",
  prominent = false,
  className,
  valueClassName,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value?: ReactNode;
  surface?: "plain" | "card";
  prominent?: boolean;
  valueClassName?: string;
}) {
  const content = (
    <>
      <p className="app-info-block__label">{label}</p>
      <p className={cn("app-info-block__value", valueClassName)}>{value ?? "-"}</p>
    </>
  );
  if (surface === "card") {
    return (
      <AppSurfaceItem className={cn("app-info-block", prominent && "app-info-block--prominent", className)} {...props}>
        {content}
      </AppSurfaceItem>
    );
  }

  return (
    <div className={cn("app-info-block", prominent && "app-info-block--prominent", className)} {...props}>
      {content}
    </div>
  );
}
