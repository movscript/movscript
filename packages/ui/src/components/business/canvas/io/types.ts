import type { ChangeEventHandler, ReactNode } from "react";

import type { AccentTone } from "../../../../semantic";
import type { IconComponent } from "../../../primitives/types";
import type { CanvasPortHandleRenderer } from "../card";

export type CanvasIOTone = Extract<AccentTone, "sky" | "emerald" | "amber">;
export type CanvasIOState = "empty" | "ready" | "pending" | "failed";

export type CanvasIOPort = {
  id: string;
  label: string;
  type: "target" | "source";
  side: "left" | "right";
  dataType: string;
  required?: boolean;
};

export type CanvasIOMetaItem = {
  id: string;
  label: string;
  value: string;
};

export type CanvasIOParamTypeOption = {
  value: string;
  label: string;
};

export type CanvasIOEditableFields = {
  nameLabel: string;
  nameValue: string;
  namePlaceholder?: string;
  orderLabel: string;
  orderValue?: number;
  typeLabel?: string;
  typeValue?: string;
  typeOptions?: CanvasIOParamTypeOption[];
  onNameChange?: ChangeEventHandler<HTMLInputElement>;
  onOrderChange?: ChangeEventHandler<HTMLInputElement>;
  onTypeChange?: ChangeEventHandler<HTMLSelectElement>;
};

export type CanvasIOPortHandleRenderer = CanvasPortHandleRenderer;

export type CanvasIOAction = {
  id: string;
  label: string;
  icon?: IconComponent;
  onClick?: () => void;
  disabled?: boolean;
};

export interface CanvasIOActionCardProps {
  tone: CanvasIOTone;
  icon: IconComponent;
  title: string;
  subtitle?: string;
  status?: string;
  selected?: boolean;
  port: CanvasIOPort;
  metaItems?: CanvasIOMetaItem[];
  state: CanvasIOState;
  stateLabel: string;
  bodyLabel: string;
  bodyValue?: string;
  emptyLabel?: string;
  editableFields?: CanvasIOEditableFields;
  primaryAction?: CanvasIOAction;
  footer?: ReactNode;
  className?: string;
  renderPortHandle?: CanvasIOPortHandleRenderer;
}
