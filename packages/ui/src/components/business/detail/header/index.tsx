import type { ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import type { DetailHeaderAttributes } from "../types";

export function DetailHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  className,
  children,
  ...props
}: DetailHeaderAttributes & {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={cn("detail-header", className)} {...props}>
      <div className="detail-header__layout">
        <div className="detail-header__content">
          {eyebrow ? <div className="detail-header__eyebrow">{eyebrow}</div> : null}
          <div className="detail-header__copy">
            <div className="detail-header__title-row">
              <h2 className="detail-header__title">{title}</h2>
              {description ? <p className="detail-header__description">{description}</p> : null}
            </div>
            {meta ? <div className="detail-header__meta">{meta}</div> : null}
            {children}
          </div>
        </div>
        {actions ? <div className="detail-header__actions">{actions}</div> : null}
      </div>
    </header>
  );
}
