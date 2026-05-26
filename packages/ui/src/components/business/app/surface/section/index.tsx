import type { ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { Surface } from "../../../../primitives";
import type { IconComponent } from "../../../../primitives/types";

export function AppSection({
  children,
  eyebrow,
  title,
  description,
  icon: Icon,
  iconClassName,
  action,
  className,
  bodyClassName,
}: {
  children: ReactNode;
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  icon?: IconComponent;
  iconClassName?: string;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Surface as="section" kind="section" density="normal" emphasis="raised" className={cn("app-section", className)}>
      {title || description || Icon || action ? (
        <div className="ms-frame__header ms-surface__header app-section__header">
          <div className="ms-surface__heading app-section__heading">
            {Icon ? <Icon size={14} className={cn("ms-surface__icon app-section__icon", iconClassName)} /> : null}
            <div className="ms-surface__copy app-section__copy">
              {eyebrow ? <div className="app-section__eyebrow">{eyebrow}</div> : null}
              {title ? <h2 className="ms-surface__title app-section__title">{title}</h2> : null}
              {description ? <p className="ms-surface__description app-section__description">{description}</p> : null}
            </div>
          </div>
          {action ? <div className="ms-surface__action app-section__action">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn("ms-surface__body app-section__body", bodyClassName)}>{children}</div>
    </Surface>
  );
}
