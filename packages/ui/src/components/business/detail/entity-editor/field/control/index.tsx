import type { ReactNode } from "react";

import { cn } from "../../../../../../lib/cn";
import { toneTextClass } from "../../../../../../semantic";
import { CheckboxField, Input, Label, NativeSelect, Textarea } from "../../../../../primitives";
import type { DetailEntityFieldDefinition, DetailEntityFieldOption, DetailEntityFieldValue } from "../../types";

export function DetailEntityFieldControl({
  id,
  field,
  value,
  optionsOverride,
  advanced = false,
  disabled = false,
  invalid = false,
  lockReason,
  checkboxLabel = "启用",
  emptyOptionLabel = "未设置",
  className,
  onChange,
}: {
  id: string;
  field: DetailEntityFieldDefinition;
  value: DetailEntityFieldValue;
  optionsOverride?: DetailEntityFieldOption[];
  advanced?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  lockReason?: string;
  checkboxLabel?: ReactNode;
  emptyOptionLabel?: ReactNode;
  className?: string;
  onChange: (value: DetailEntityFieldValue) => void;
}) {
  return (
    <div className={cn(field.type === "textarea" && "detail-entity-field--wide", className)}>
      <Label htmlFor={id} required={field.required}>{field.label}</Label>
      <div className="detail-entity-field__control">
        {field.type === "textarea" ? (
          <Textarea
            id={id}
            required={field.required}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            value={String(value ?? "")}
            rows={field.key.endsWith("_json") ? 5 : advanced ? 3 : 4}
            placeholder={field.placeholder}
            className={field.key.endsWith("_json") ? "font-mono type-label" : undefined}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : field.type === "select" || optionsOverride ? (
          <NativeSelect
            id={id}
            required={field.required}
            disabled={disabled}
            invalid={invalid}
            value={String(value ?? "")}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">{emptyOptionLabel}</option>
            {(optionsOverride ?? field.options)?.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </NativeSelect>
        ) : field.type === "boolean" ? (
          <CheckboxField
            disabled={disabled}
            checked={Boolean(value)}
            inputProps={{ id, required: field.required }}
            onCheckedChange={onChange}
          >
            {checkboxLabel}
          </CheckboxField>
        ) : (
          <Input
            id={id}
            required={field.required}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            type={field.type === "number" ? "number" : "text"}
            step={field.type === "number" ? "any" : undefined}
            value={String(value ?? "")}
            placeholder={field.placeholder}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </div>
      {lockReason ? (
        <p className={cn("detail-entity-field__help detail-entity-field__help--locked", toneTextClass("warning"))}>{lockReason}</p>
      ) : field.helper ? (
        <p className="detail-entity-field__help">{field.helper}</p>
      ) : null}
    </div>
  );
}
