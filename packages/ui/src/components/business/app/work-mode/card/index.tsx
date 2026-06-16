import type { ReactNode } from "react";

import { Button } from "../../../../primitives/button";
import { ArrowRightIcon } from "../../../../primitives/icons";
import type { IconComponent } from "../../../../primitives/types";
import { AppIconFrame } from "../../display";
import { AppSurfaceItem } from "../../surface";
import { WorkModeSwitchGuide } from "../switch-guide";
import type { WorkModeChoice } from "../types";

export function WorkModeCard({
  icon: Icon,
  title,
  description,
  action,
  mode,
  agentIcon,
  projectIcon,
  onSelect,
}: {
  icon: IconComponent;
  title: ReactNode;
  description: ReactNode;
  action: ReactNode;
  mode: WorkModeChoice;
  agentIcon: IconComponent;
  projectIcon: IconComponent;
  onSelect: (mode: WorkModeChoice) => void;
}) {
  return (
    <AppSurfaceItem asChild className="work-mode-card">
      <Button
        type="button"
        variant="ghost"
        align="start"
        onClick={() => onSelect(mode)}
        className="work-mode-card__button"
      >
        <div className="work-mode-card__header">
          <AppIconFrame className="work-mode-card__icon">
            <Icon size={18} />
          </AppIconFrame>
          <WorkModeSwitchGuide activeMode={mode} compact agentIcon={agentIcon} projectIcon={projectIcon} />
        </div>
        <h2 className="ms-type-section work-mode-card__title">{title}</h2>
        <p className="work-mode-card__description">{description}</p>
        <span className="ms-inline-center ms-type-body work-mode-card__action">
          {action}
          <ArrowRightIcon className="work-mode-card__action-icon" />
        </span>
      </Button>
    </AppSurfaceItem>
  );
}
