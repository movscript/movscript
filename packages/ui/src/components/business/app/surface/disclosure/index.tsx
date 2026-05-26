import type { DetailsHTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { Surface } from "../../../../primitives";

export function AppDisclosure({
  title,
  children,
  className,
  bodyClassName,
  ...props
}: Omit<DetailsHTMLAttributes<HTMLDetailsElement>, "title"> & {
  title: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <Surface as="details" kind="panel" density="normal" emphasis="plain" className={cn("app-disclosure", className)} {...props}>
      <summary className="ms-frame__header app-disclosure__summary">{title}</summary>
      <div className={cn("ms-frame__body app-disclosure__body", bodyClassName)}>{children}</div>
    </Surface>
  );
}
