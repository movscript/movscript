import { forwardRef, type ChangeEventHandler, type DragEvent, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { toneSurfaceClass, toneTextClass } from "../../../../semantic";
import { AppEmptyState, AppInlineMeta, AppSurfaceItem } from "../../app";
import { Badge, Input, type InputProps } from "../../../primitives";
import { CanvasResourceShelfThumbFrame } from "../media";

export type CanvasResourceShelfVariant = "floating" | "panel" | "side";

export type CanvasResourceShelfItem = {
  id: string | number;
  type: ReactNode;
  name: ReactNode;
  description?: ReactNode;
  footerMeta: ReactNode;
  media: ReactNode;
  selected?: boolean;
};

export type CanvasResourceShelfViewProps = {
  variant?: CanvasResourceShelfVariant;
  title?: ReactNode;
  titleIcon?: ReactNode;
  navLabel: ReactNode;
  totalCount: ReactNode;
  searchIcon?: ReactNode;
  searchValue: string;
  searchPlaceholder?: string;
  onSearchChange: ChangeEventHandler<HTMLInputElement>;
  hint: ReactNode;
  emptyTitle: ReactNode;
  items: CanvasResourceShelfItem[];
  selectedLabel?: ReactNode;
  dragMetaLabel?: ReactNode;
  idPrefix?: ReactNode;
  onItemDragStart?: (event: DragEvent<HTMLDivElement>, item: CanvasResourceShelfItem) => void;
};

export function CanvasResourceShelfView({
  variant = "floating",
  title,
  titleIcon,
  navLabel,
  totalCount,
  searchIcon,
  searchValue,
  searchPlaceholder,
  onSearchChange,
  hint,
  emptyTitle,
  items,
  selectedLabel,
  dragMetaLabel,
  idPrefix = "#",
  onItemDragStart,
}: CanvasResourceShelfViewProps) {
  const side = variant === "side";
  return (
    <CanvasResourceShelfShell variant={variant}>
      <CanvasResourceShelfHeader variant={variant}>
        {variant === "floating" && title ? (
          <CanvasResourceShelfTitle icon={titleIcon}>
            {title}
          </CanvasResourceShelfTitle>
        ) : null}
        <CanvasResourceShelfNav>
          <CanvasResourceShelfCountPill label={navLabel} count={totalCount} />
        </CanvasResourceShelfNav>
        <CanvasResourceShelfSearch
          side={side}
          icon={searchIcon}
          value={searchValue}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
        />
        <CanvasResourceShelfHint>{hint}</CanvasResourceShelfHint>
      </CanvasResourceShelfHeader>
      <CanvasResourceShelfBody>
        {items.length > 0 ? (
          <CanvasResourceShelfGrid side={side}>
            {items.map((item) => (
              <CanvasResourceShelfResourceCard
                key={item.id}
                item={item}
                compact={side}
                selectedLabel={selectedLabel}
                dragMetaLabel={dragMetaLabel}
                idPrefix={idPrefix}
                onDragStart={onItemDragStart ? (event) => onItemDragStart(event, item) : undefined}
              />
            ))}
          </CanvasResourceShelfGrid>
        ) : (
          <CanvasResourceShelfEmpty title={emptyTitle} />
        )}
      </CanvasResourceShelfBody>
    </CanvasResourceShelfShell>
  );
}

export function CanvasResourceShelfResourceCard({
  item,
  compact = false,
  selectedLabel,
  dragMetaLabel,
  idPrefix = "#",
  onDragStart,
}: {
  item: CanvasResourceShelfItem;
  compact?: boolean;
  selectedLabel?: ReactNode;
  dragMetaLabel?: ReactNode;
  idPrefix?: ReactNode;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
}) {
  const compactMeta = compact ? (
    <CanvasResourceShelfCardFooter
      idLabel={<>{idPrefix}{item.id}</>}
      meta={item.selected && selectedLabel ? selectedLabel : item.footerMeta}
    />
  ) : null;
  return (
    <CanvasResourceShelfCard
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      compact={compact}
      selected={item.selected}
      title={typeof item.name === "string" ? item.name : undefined}
    >
      <CanvasResourceShelfCardBody>
        <CanvasResourceShelfThumbFrame compact={compact}>
          {item.media}
        </CanvasResourceShelfThumbFrame>
        <CanvasResourceShelfCardContent>
          {!compact ? (
            <CanvasResourceShelfCardMetaRow>
              <CanvasResourceShelfTypeBadge>{item.type}</CanvasResourceShelfTypeBadge>
              {item.selected && selectedLabel ? <CanvasResourceShelfSelectedBadge>{selectedLabel}</CanvasResourceShelfSelectedBadge> : null}
            </CanvasResourceShelfCardMetaRow>
          ) : null}
          <CanvasResourceShelfResourceName>{item.name}</CanvasResourceShelfResourceName>
          {item.description ? (
            <CanvasResourceShelfResourceDescription>
              {item.description}
            </CanvasResourceShelfResourceDescription>
          ) : null}
          {compactMeta}
        </CanvasResourceShelfCardContent>
      </CanvasResourceShelfCardBody>
      {!compact ? (
        <CanvasResourceShelfCardFooter
          idLabel={<>{idPrefix}{item.id}</>}
          meta={item.selected && dragMetaLabel ? dragMetaLabel : item.footerMeta}
        />
      ) : null}
    </CanvasResourceShelfCard>
  );
}

export function CanvasResourceShelfShell({
  variant = "floating",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: CanvasResourceShelfVariant;
  children: ReactNode;
}) {
  const framed = variant === "panel" || variant === "side";
  return (
    <AppSurfaceItem
      variant={framed ? "card" : "overlay"}
      data-variant={variant}
      className={cn("canvas-resource-shelf", className)}
      {...props}
    >
      {children}
    </AppSurfaceItem>
  );
}

export function CanvasResourceShelfHeader({
  variant = "floating",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: CanvasResourceShelfVariant;
  children: ReactNode;
}) {
  return (
    <div data-variant={variant} className={cn("canvas-resource-shelf__header", className)} {...props}>
      {children}
    </div>
  );
}

export function CanvasResourceShelfTitle({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("canvas-resource-shelf__title", className)} {...props}>
      {icon}
      <span>{children}</span>
    </div>
  );
}

export function CanvasResourceShelfNav({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  children: ReactNode;
}) {
  return (
    <nav className={cn("canvas-resource-shelf__nav", className)} {...props}>
      {children}
    </nav>
  );
}

export function CanvasResourceShelfCountPill({
  label,
  count,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  count: ReactNode;
}) {
  return (
    <AppInlineMeta className={cn("canvas-resource-shelf__count-pill", className)} {...props}>
      <span className="canvas-resource-shelf__count-label">{label}</span>
      <Badge className="canvas-resource-shelf__count-value">{count}</Badge>
    </AppInlineMeta>
  );
}

export const CanvasResourceShelfSearch = forwardRef<HTMLInputElement, InputProps & {
  icon?: ReactNode;
  side?: boolean;
}>(({ icon, side = false, className, ...props }, ref) => (
  <div data-side={side ? "true" : undefined} className="canvas-resource-shelf__search">
    {icon ? <span className="canvas-resource-shelf__search-icon">{icon}</span> : null}
    <Input ref={ref} className={cn("canvas-resource-shelf__search-input", className)} {...props} />
  </div>
));

CanvasResourceShelfSearch.displayName = "CanvasResourceShelfSearch";

export function CanvasResourceShelfHint({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
}) {
  return (
    <span className={cn("canvas-resource-shelf__hint", className)} {...props}>
      {children}
    </span>
  );
}

export function CanvasResourceShelfBody({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <div className={cn("canvas-resource-shelf__body", className)} {...props}>
      <div className="canvas-resource-shelf__scroll">{children}</div>
    </div>
  );
}

export function CanvasResourceShelfGrid({
  side = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  side?: boolean;
  children: ReactNode;
}) {
  return (
    <div data-side={side ? "true" : undefined} className={cn("canvas-resource-shelf__grid", className)} {...props}>
      {children}
    </div>
  );
}

export function CanvasResourceShelfEmpty({
  title,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  title: ReactNode;
}) {
  return <AppEmptyState compact title={title} className={cn("canvas-resource-shelf__empty", className)} {...props} />;
}

export function CanvasResourceShelfCard({
  compact = false,
  selected = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  compact?: boolean;
  selected?: boolean;
  children: ReactNode;
}) {
  return (
    <AppSurfaceItem
      data-compact={compact ? "true" : "false"}
      data-selected={selected ? "true" : undefined}
      className={cn("canvas-resource-shelf-card", selected ? toneSurfaceClass("success") : undefined, className)}
      {...props}
    >
      {children}
    </AppSurfaceItem>
  );
}

export function CanvasResourceShelfCardBody({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <div className={cn("canvas-resource-shelf-card__body", className)} {...props}>
      {children}
    </div>
  );
}

export function CanvasResourceShelfCardContent({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <div className={cn("canvas-resource-shelf-card__content", className)} {...props}>
      {children}
    </div>
  );
}

export function CanvasResourceShelfCardMetaRow({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <div className={cn("canvas-resource-shelf-card__meta-row", className)} {...props}>
      {children}
    </div>
  );
}

export function CanvasResourceShelfTypeBadge({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
}) {
  return (
    <Badge variant="outline" className={cn("canvas-resource-shelf-card__type", className)} {...props}>
      {children}
    </Badge>
  );
}

export function CanvasResourceShelfSelectedBadge({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <AppInlineMeta className={cn("canvas-resource-shelf-card__selected", toneTextClass("success"), className)} {...props}>
      {children}
    </AppInlineMeta>
  );
}

export function CanvasResourceShelfResourceName({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  children: ReactNode;
}) {
  return (
    <p className={cn("canvas-resource-shelf-card__name", className)} {...props}>
      {children}
    </p>
  );
}

export function CanvasResourceShelfResourceDescription({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  children: ReactNode;
}) {
  return (
    <p className={cn("canvas-resource-shelf-card__description", className)} {...props}>
      {children}
    </p>
  );
}

export function CanvasResourceShelfCardFooter({
  idLabel,
  meta,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  idLabel: ReactNode;
  meta: ReactNode;
}) {
  return (
    <AppSurfaceItem variant="muted" className={cn("canvas-resource-shelf-card__footer", className)} {...props}>
      <span className="canvas-resource-shelf-card__id">{idLabel}</span>
      <AppInlineMeta className="canvas-resource-shelf-card__footer-meta">{meta}</AppInlineMeta>
    </AppSurfaceItem>
  );
}
