import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { Surface } from "../../../../primitives";
import type { IconComponent } from "../../../../primitives/types";

export function AppPanel({
  children,
  title,
  icon: Icon,
  iconClassName,
  action,
  className,
  bodyClassName,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  icon?: IconComponent;
  iconClassName?: string;
  action?: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <Surface as="section" kind="panel" density="normal" emphasis="plain" className={cn("app-panel", className)} {...props}>
      {title || Icon || action ? (
        <div className="ms-frame__header ms-surface__header app-panel__header">
          <div className="ms-surface__heading app-panel__heading">
            {Icon ? <Icon size={14} className={cn("ms-surface__icon app-panel__icon", iconClassName)} /> : null}
            {title ? <h2 className="ms-surface__title app-panel__title">{title}</h2> : null}
          </div>
          {action ? <div className="ms-surface__action app-panel__action">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn("ms-surface__body app-panel__body", bodyClassName)}>{children}</div>
    </Surface>
  );
}
