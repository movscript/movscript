import type { ReactNode } from "react";

import { Button } from "../../../primitives/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../primitives/select";
import { RefreshIcon } from "../../../primitives/icons";
import { cn } from "../../../../lib/cn";

export interface GenerationModelSelectorOption {
  value: string;
  label: ReactNode;
}

export function GenerationModelSelector({
  value,
  options,
  placeholder,
  refreshLabel,
  disabled,
  refreshing = false,
  className,
  onValueChange,
  onRefresh,
}: {
  value: string;
  options: GenerationModelSelectorOption[];
  placeholder?: string;
  refreshLabel?: string;
  disabled?: boolean;
  refreshing?: boolean;
  className?: string;
  onValueChange: (value: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className={cn("generation-model-selector", className)}>
      <Select
        disabled={disabled || options.length === 0}
        value={value}
        onValueChange={onValueChange}
      >
        <SelectTrigger className="generation-model-selector__trigger">
          <SelectValue placeholder={options.length === 0 ? placeholder : undefined} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onRefresh}
        disabled={refreshing}
        title={refreshLabel}
        className="generation-model-selector__refresh"
      >
        <RefreshIcon size={14} className={refreshing ? "generation-model-selector__refresh-icon--spinning" : undefined} />
      </Button>
    </div>
  );
}
