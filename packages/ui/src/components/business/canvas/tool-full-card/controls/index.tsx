import type { MouseEventHandler, ReactNode } from "react";

import { Button } from "../../../../primitives/button";
import { NativeSelect } from "../../../../primitives/select";
import type { CanvasToolFullCardModelOption } from "../types";

export function CanvasToolFullModelSelect({
  models,
  selectedModel,
  onChange,
  onClick,
}: {
  models: CanvasToolFullCardModelOption[];
  selectedModel?: string | number;
  onChange?: (value: string) => void;
  onClick?: MouseEventHandler<HTMLSelectElement>;
}) {
  if (models.length === 0) return null;

  return (
    <NativeSelect
      controlSize="sm"
      className="canvas-tool-full-card__model nodrag"
      value={selectedModel ?? models[0]?.value ?? ""}
      onChange={(event) => onChange?.(event.target.value)}
      onClick={onClick}
    >
      {models.map((model) => (
        <option key={String(model.value)} value={model.value}>{model.label}</option>
      ))}
    </NativeSelect>
  );
}

export function CanvasToolFullModeButton({
  children,
  icon,
  ...props
}: {
  children: ReactNode;
  icon?: ReactNode;
  title?: string;
  onPointerDown?: MouseEventHandler<HTMLButtonElement>;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className="canvas-tool-full-card__mode nodrag"
      {...props}
    >
      {children}
      {icon}
    </Button>
  );
}
