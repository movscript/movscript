import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { DetailPill } from "../badge";

export function DetailPreviewFieldList({
  fields,
  emptyText,
  className,
  renderDirection,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  fields: Array<{
    id: string;
    label: ReactNode;
    summary: ReactNode;
    hasValue?: boolean;
    readable?: boolean;
    writable?: boolean;
  }>;
  emptyText: ReactNode;
  renderDirection?: (direction: "in" | "out") => ReactNode;
}) {
  if (fields.length === 0) {
    return <p className={cn("detail-preview-list__empty", className)}>{emptyText}</p>;
  }

  return (
    <div className={cn("detail-preview-list", className)} {...props}>
      {fields.map((field) => (
        <div key={field.id} className="detail-preview-list__item">
          <div className="detail-preview-list__header">
            <span className="detail-preview-list__label">{field.label}</span>
            {field.readable ? renderDirection?.("out") ?? <DetailPill className="detail-preview-list__direction">out</DetailPill> : null}
            {field.writable ? renderDirection?.("in") ?? <DetailPill className="detail-preview-list__direction">in</DetailPill> : null}
          </div>
          <p data-empty={!field.hasValue ? "true" : undefined} className="detail-preview-list__summary">{field.summary}</p>
        </div>
      ))}
    </div>
  );
}
