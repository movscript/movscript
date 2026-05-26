import type { ReactNode } from "react";

import { Button, Label } from "../../../../primitives";

export function ResourceLibraryPickerHeader({
  title,
  clearLabel,
  showClear,
  onClear,
}: {
  title: ReactNode;
  clearLabel: ReactNode;
  showClear?: boolean;
  onClear?: () => void;
}) {
  return (
    <div className="resource-library-picker__header">
      <Label className="resource-library-picker__title">{title}</Label>
      {showClear && onClear ? (
        <Button type="button" variant="ghost" size="xs" onClick={onClear}>
          {clearLabel}
        </Button>
      ) : null}
    </div>
  );
}
