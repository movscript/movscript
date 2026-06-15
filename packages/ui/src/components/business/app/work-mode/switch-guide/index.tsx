import type { IconComponent } from "../../../../primitives/types";
import { cn } from "../../../../../lib/cn";
import type { WorkModeChoice } from "../types";

export function WorkModeSwitchGuide({
  activeMode,
  compact = false,
  agentIcon: AgentIcon,
  projectIcon: ProjectIcon,
}: {
  activeMode: WorkModeChoice;
  compact?: boolean;
  agentIcon: IconComponent;
  projectIcon: IconComponent;
}) {
  const CurrentIcon = activeMode === "agent" ? AgentIcon : ProjectIcon;
  const NextIcon = activeMode === "agent" ? ProjectIcon : AgentIcon;

  return (
    <div className={cn("onboarding-switch-guide", compact && "onboarding-switch-guide--compact")} aria-hidden="true">
      <span className="onboarding-switch-guide__bar">
        <span className="onboarding-switch-guide__dot" />
        <span className="onboarding-switch-guide__button onboarding-switch-guide__button--current">
          <CurrentIcon size={compact ? 11 : 13} />
        </span>
        <span className="onboarding-switch-guide__button onboarding-switch-guide__button--next">
          <NextIcon size={compact ? 11 : 13} />
        </span>
      </span>
    </div>
  );
}
