import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { Surface } from "../../../../primitives";

export function WorkbenchEntityCard({
  active,
  media,
  title,
  description,
  meta,
  status,
  action,
  className,
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> & {
  active?: boolean;
  media?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Surface
      as="button"
      type="button"
      kind="item"
      density="normal"
      emphasis="plain"
      interaction={active ? "selected" : "selectable"}
      data-active={active ? "true" : undefined}
      className={cn("ms-workbench-selectable workbench-entity-card", className)}
      {...props}
    >
      <div className="ms-workbench-row workbench-entity-card__row">
        {media ? <div className="workbench-entity-card__media">{media}</div> : null}
        <div className="ms-workbench-row workbench-entity-card__content">
          <div className="ms-workbench-copy workbench-entity-card__main">
            <p className="workbench-entity-card__title">{title}</p>
            {description ? <p className="workbench-entity-card__description">{description}</p> : null}
            {meta ? <div className="ms-workbench-wrap workbench-entity-card__meta">{meta}</div> : null}
          </div>
          {status || action ? (
            <div className="ms-workbench-side workbench-entity-card__aside">
              {status}
              {action}
            </div>
          ) : null}
        </div>
      </div>
      {children}
    </Surface>
  );
}
