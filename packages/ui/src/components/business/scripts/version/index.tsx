import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { Button } from "../../../primitives/button";

type ScriptVersionCardAttributes = Omit<HTMLAttributes<HTMLDivElement>, "title">;

export interface ScriptVersionCardProps extends ScriptVersionCardAttributes {
  versionLabel: ReactNode;
  status?: ReactNode;
  title: ReactNode;
  meta: ReactNode;
  toggleLabel?: ReactNode;
  onToggle?: () => void;
}

export function ScriptVersionCard({
  versionLabel,
  status,
  title,
  meta,
  toggleLabel,
  onToggle,
  children,
  className,
  ...props
}: ScriptVersionCardProps) {
  return (
    <div className={cn("script-version-card", className)} {...props}>
      <div className="script-version-card__header">
        <div className="script-version-card__copy">
          <div className="script-version-card__title-row">
            <span className="script-version-card__version">{versionLabel}</span>
            {status}
            <span className="script-version-card__title">{title}</span>
          </div>
          <p className="script-version-card__meta">{meta}</p>
        </div>
        {onToggle && toggleLabel ? (
          <div className="script-version-card__actions">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onToggle}
              className="script-version-card__toggle"
            >
              {toggleLabel}
            </Button>
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
