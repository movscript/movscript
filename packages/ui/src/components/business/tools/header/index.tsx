import type { ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { WrenchIcon } from "../../../primitives/icons";
import type { IconComponent } from "../../../primitives/types";

export interface ToolHeaderProps {
  title: string;
  description?: string;
  icon?: IconComponent;
  metadata?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function ToolHeader({
  title,
  description,
  icon: Icon = WrenchIcon,
  metadata,
  actions,
  className,
}: ToolHeaderProps) {
  return (
    <header data-testid="tool-header" className={cn("tool-header", className)}>
      <div className="tool-header__inner">
        <div className="tool-header__identity">
          <span className="tool-header__icon">
            <Icon size={18} />
          </span>
          <div className="tool-header__copy">
            <div className="tool-header__title-row">
              <h1 className="tool-header__title">{title}</h1>
              {metadata}
            </div>
            {description ? <p className="tool-header__description">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="tool-header__actions">{actions}</div> : null}
      </div>
    </header>
  );
}
