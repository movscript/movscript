"use client";

import type { KeyboardEvent } from "react";

import { Button, Input, Label, Textarea } from "../../../primitives";

export interface ScriptCreateFormShellProps {
  titleLabel: string;
  titlePlaceholder: string;
  title: string;
  onTitleChange: (value: string) => void;
  categoryLabel: string;
  categoryPlaceholder: string;
  categoryHelper?: string;
  category: string;
  onCategoryChange: (value: string) => void;
  descriptionLabel: string;
  description: string;
  onDescriptionChange: (value: string) => void;
  createLabel: string;
  creatingLabel: string;
  cancelLabel: string;
  canSubmit: boolean;
  submitting?: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export function ScriptCreateFormShell({
  titleLabel,
  titlePlaceholder,
  title,
  onTitleChange,
  categoryLabel,
  categoryPlaceholder,
  categoryHelper,
  category,
  onCategoryChange,
  descriptionLabel,
  description,
  onDescriptionChange,
  createLabel,
  creatingLabel,
  cancelLabel,
  canSubmit,
  submitting = false,
  onSubmit,
  onCancel,
}: ScriptCreateFormShellProps) {
  function handleTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && canSubmit && !submitting) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="script-create-form">
      <div className="script-create-form__field">
        <Label className="script-create-form__label">{titleLabel}</Label>
        <Input
          autoFocus
          placeholder={titlePlaceholder}
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          onKeyDown={handleTitleKeyDown}
        />
      </div>
      <div className="script-create-form__field">
        <Label className="script-create-form__label">{categoryLabel}</Label>
        <Input
          placeholder={categoryPlaceholder}
          value={category}
          onChange={(event) => onCategoryChange(event.target.value)}
        />
        {categoryHelper ? <p className="script-create-form__hint">{categoryHelper}</p> : null}
      </div>
      <div className="script-create-form__field">
        <Label className="script-create-form__label">{descriptionLabel}</Label>
        <Textarea
          className="script-create-form__textarea"
          rows={2}
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
        />
      </div>
      <div className="script-create-form__actions">
        <Button
          className="script-create-form__submit"
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
        >
          {submitting ? creatingLabel : createLabel}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </div>
  );
}
