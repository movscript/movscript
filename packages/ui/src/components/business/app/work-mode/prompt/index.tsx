import type { IconComponent } from "../../../../primitives/types";
import { WorkModeCard } from "../card";
import type { WorkModeChoice } from "../types";

export function WorkModePrompt({
  title,
  description,
  agentTitle,
  agentDescription,
  agentAction,
  projectTitle,
  projectDescription,
  projectAction,
  agentIcon,
  projectIcon,
  onSelect,
}: {
  title?: string;
  description?: string;
  agentTitle: string;
  agentDescription: string;
  agentAction: string;
  projectTitle: string;
  projectDescription: string;
  projectAction: string;
  agentIcon: IconComponent;
  projectIcon: IconComponent;
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
          projectIcon={projectIcon}
          onSelect={onSelect}
        />
        <WorkModeCard
          icon={projectIcon}
          title={projectTitle}
          description={projectDescription}
          action={projectAction}
          mode="project"
          agentIcon={agentIcon}
          projectIcon={projectIcon}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}
