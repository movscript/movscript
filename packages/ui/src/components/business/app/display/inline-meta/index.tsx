import type { HTMLAttributes } from "react";

import { AsChildSlot } from "../../../../../lib/asChild";
import { cn } from "../../../../../lib/cn";
import type { IconComponent } from "../../../../primitives/types";

export function AppInlineMeta({
  asChild = false,
  icon: Icon,
  children,
  className,
  iconClassName,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  asChild?: boolean;
  icon?: IconComponent;
  iconClassName?: string;
}) {
  const Comp = asChild ? AsChildSlot : "div";
  if (asChild) {
    return <Comp className={cn("ms-inline-badge ms-inline-badge--truncate app-inline-meta", className)} {...props}>{children}</Comp>;
  }
  return (
    <Comp className={cn("ms-inline-badge ms-inline-badge--truncate app-inline-meta", className)} {...props}>
      {Icon ? <Icon size={12} className={cn("app-inline-meta__icon", iconClassName)} /> : null}
      <span className="app-inline-meta__text">{children}</span>
    </Comp>
  );
}
