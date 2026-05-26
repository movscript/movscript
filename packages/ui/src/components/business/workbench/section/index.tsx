import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../../../lib/cn";
import { Surface, type SurfaceEmphasis } from "../../../primitives";
import type { WorkbenchIconComponent } from "../types";

export function WorkbenchSection({
  title,
  description,
  icon: Icon,
  action,
  children,
  emphasis = "plain",
  className,
  bodyClassName,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  description?: ReactNode;
  icon?: WorkbenchIconComponent;
  action?: ReactNode;
  children: ReactNode;
  emphasis?: SurfaceEmphasis;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Surface as="section" kind="section" density="normal" emphasis={emphasis} className={cn("workbench-section", className)} {...props}>
      {title || description || Icon || action ? (
        <div className="ms-frame__header ms-surface__header workbench-section__header">
          <div className="ms-surface__heading workbench-section__heading">
            {Icon ? <Icon size={14} className="ms-surface__icon workbench-section__icon" /> : null}
            <div className="ms-surface__copy workbench-section__copy">
              {title ? <h2 className="ms-surface__title workbench-section__title">{title}</h2> : null}
              {description ? <p className="ms-surface__description workbench-section__description">{description}</p> : null}
            </div>
          </div>
          {action ? <div className="ms-surface__action workbench-section__action">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn("ms-surface__body workbench-section__body", bodyClassName)}>{children}</div>
    </Surface>
  );
}
