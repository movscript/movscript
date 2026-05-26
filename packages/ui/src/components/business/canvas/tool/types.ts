import type { ReactNode } from "react";

import type { AccentTone } from "../../../../semantic";
import type { IconComponent } from "../../../primitives/types";

export type CanvasToolSource = "ai" | "plugin";
export type CanvasToolTone = Extract<AccentTone, "violet" | "cyan" | "amber" | "emerald">;
export type CanvasToolSlotType = "text" | "prompt" | "image" | "video" | "json";
export type CanvasToolSlotState = "empty" | "ready" | "pending" | "failed";

export type CanvasToolSlot = {
  id: string;
  label: string;
  type: CanvasToolSlotType;
  state: CanvasToolSlotState;
  summary?: string;
  inputPortId?: string;
  outputPortId?: string;
};

export type CanvasToolConfigItem = {
  id: string;
  label: string;
  value: string;
};

export type CanvasToolPortHandleRenderer = (handle: {
  id: string;
  type: "target" | "source";
  side: "left" | "right";
  label: string;
}) => ReactNode;

export type CanvasToolAction = {
  id: string;
  label: string;
  icon?: IconComponent;
  onClick?: () => void;
  disabled?: boolean;
};

export interface CanvasToolActionCardProps {
  source: CanvasToolSource;
  tone?: CanvasToolTone;
  icon?: IconComponent;
  title: string;
  subtitle?: string;
  status?: string;
  selected?: boolean;
  inputs?: CanvasToolSlot[];
  configs?: CanvasToolConfigItem[];
  outputs?: CanvasToolSlot[];
  inputPanel?: ReactNode;
  resultPanel?: ReactNode;
  primaryAction?: CanvasToolAction;
  secondaryAction?: CanvasToolAction;
  footer?: ReactNode;
  className?: string;
  renderPortHandle?: CanvasToolPortHandleRenderer;
}
