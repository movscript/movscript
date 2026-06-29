import type { CSSProperties, HTMLAttributes } from "react";

import { cn } from "../../../../../lib/cn";
import { Button } from "../../../../primitives/button";

export type GenerationReferenceRoleMenuOption = {
  value: string;
  label: string;
  hint?: string;
};

export function GenerationReferenceRoleMenu({
  options,
  value,
  onRoleSelect,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  options: readonly GenerationReferenceRoleMenuOption[];
  value?: string | null;
  onRoleSelect: (value: string) => void;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn("generation-reference-role-menu", className)}
      style={style}
      role="menu"
      onMouseDown={(event) => event.preventDefault()}
      {...props}
    >
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant="ghost"
          size="sm"
          className="generation-reference-role-menu__item"
          data-active={option.value === value ? "true" : undefined}
          onClick={() => onRoleSelect(option.value)}
        >
          <span className="generation-reference-role-menu__label">{option.label}</span>
          {option.hint ? (
            <span className="generation-reference-role-menu__hint">{option.hint}</span>
          ) : null}
        </Button>
      ))}
    </div>
  );
}
