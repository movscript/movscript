import type { HTMLAttributes } from "react";

import { cn } from "../../../../../lib/cn";
import { Input, type InputProps } from "../../../../primitives/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../primitives/select";
import type { ResourceCandidateTargetTypeOption } from "../types";

export function ResourceCandidateAttachControls({
  compact = false,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  compact?: boolean;
}) {
  return (
    <div data-compact={compact ? "true" : undefined} className={cn("resource-candidate-attach__controls", className)} {...props}>
      {children}
    </div>
  );
}

export function ResourceCandidateTargetTypeSelect({
  value,
  options,
  onValueChange,
  disabled,
}: {
  value: string;
  options: ResourceCandidateTargetTypeOption[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className="resource-candidate-attach__target-select">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={`resource-target-type-${option.value}`} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ResourceCandidateSearchInput({ className, ...props }: InputProps) {
  return <Input className={cn("resource-candidate-attach__search", className)} {...props} />;
}
