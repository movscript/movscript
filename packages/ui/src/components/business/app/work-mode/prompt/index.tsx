import type { IconComponent } from "../../../../primitives/types";
import { WorkModeCard } from "../card";
import type { WorkModeChoice } from "../types";

export function WorkModePrompt({
  title,
  description,
  agentTitle,
  agentDescription,
  agentAction,
  detailTitle,
  detailDescription,
  detailAction,
  agentIcon,
  detailIcon,
  onSelect,
}: {
  title?: string;
  description?: string;
  agentTitle: string;
  agentDescription: string;
  agentAction: string;
  detailTitle: string;
  detailDescription: string;
  detailAction: string;
  agentIcon: IconComponent;
  detailIcon: IconComponent;
  onSelect: (mode: WorkModeChoice) => void;
}) {
  return (
    <div className="work-mode-prompt">
      {title || description ? (
        <div className="work-mode-prompt__header">
          {title ? <h1 className="work-mode-prompt__title">{title}</h1> : null}
          {description ? <p className="work-mode-prompt__description">{description}</p> : null}
        </div>
      ) : null}
      <div className="work-mode-prompt__grid">
        <WorkModeCard
          icon={agentIcon}
          title={agentTitle}
          description={agentDescription}
          action={agentAction}
          mode="agent"
          agentIcon={agentIcon}
          detailIcon={detailIcon}
          onSelect={onSelect}
        />
        <WorkModeCard
          icon={detailIcon}
          title={detailTitle}
          description={detailDescription}
          action={detailAction}
          mode="detail"
          agentIcon={agentIcon}
          detailIcon={detailIcon}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}
