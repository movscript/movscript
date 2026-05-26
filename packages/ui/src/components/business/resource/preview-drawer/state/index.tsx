import type { ReactNode } from "react";

import type { IconComponent } from "../../../../primitives/types";
import { AppEmptyState, AppStateMessage } from "../../../app";

export function ResourcePreviewEmptyStoryFlow({
  icon,
  title,
  detail,
}: {
  icon: IconComponent;
  title: string;
  detail: string;
}) {
  return <AppEmptyState icon={icon} title={title} detail={detail} className="resource-preview-empty-story-flow" />;
}

export function ResourcePreviewStateMessage({
  tone,
  text,
}: {
  tone?: "neutral" | "info" | "success" | "danger";
  text: ReactNode;
}) {
  return <AppStateMessage tone={tone} text={text} />;
}

export function ResourcePreviewEmptyBlock({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return <AppEmptyState title={title} detail={detail} compact />;
}
