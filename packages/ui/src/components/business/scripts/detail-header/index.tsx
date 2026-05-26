import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";

type ScriptDetailHeaderAttributes = Omit<HTMLAttributes<HTMLElement>, "title">;

export interface ScriptDetailHeaderProps extends ScriptDetailHeaderAttributes {
  badges?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  metrics?: ReactNode;
}

export function ScriptDetailHeader({
  badges,
  title,
  description,
  actions,
  metrics,
  className,
  ...props
}: ScriptDetailHeaderProps) {
  return (
    <header className={cn("script-detail-header", className)} {...props}>
      <div className="script-detail-header__top">
        <div className="script-detail-header__copy">
          {badges ? <div className="script-detail-header__badges">{badges}</div> : null}
          <h2 className="script-detail-header__title">{title}</h2>
          {description ? <p className="script-detail-header__description">{description}</p> : null}
        </div>
        {actions ? <div className="script-detail-header__actions">{actions}</div> : null}
      </div>
      {metrics ? <div className="script-detail-header__metrics">{metrics}</div> : null}
    </header>
  );
}
