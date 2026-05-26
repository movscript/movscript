import type { ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { AppPager, AppPanel } from "../../app";
import { ResourceLibraryPickerHeader } from "./header";
import { ResourceLibraryPickerList } from "./list";
import { ResourceLibraryPickerToolbar } from "./toolbar";
import type { ResourceLibraryPickerItem, ResourceLibraryPickerOption } from "./types";

export { ResourceLibraryPickerHeader } from "./header";
export { ResourceLibraryPickerList } from "./list";
export { ResourceLibraryPickerRow } from "./row";
export { ResourceLibraryPickerToolbar } from "./toolbar";
export type { ResourceLibraryPickerItem, ResourceLibraryPickerOption } from "./types";

export function ResourceLibraryPickerPanel({
  title,
  clearLabel,
  searchPlaceholder,
  loadingLabel,
  emptyLabel,
  selectedLabel,
  pageSummary,
  previousLabel,
  nextLabel,
  searchIcon,
  items,
  search,
  type,
  typeOptions = [],
  page,
  pageCount,
  showClear,
  variant = "default",
  className,
  listClassName,
  onSearch,
  onType,
  onPage,
  onSelect,
  onClear,
  isLoading,
}: {
  title: ReactNode;
  clearLabel: ReactNode;
  searchPlaceholder?: string;
  loadingLabel: ReactNode;
  emptyLabel: ReactNode;
  selectedLabel: ReactNode;
  pageSummary: ReactNode;
  previousLabel?: string;
  nextLabel?: string;
  searchIcon?: ReactNode;
  items: ResourceLibraryPickerItem[];
  search: string;
  type: string;
  typeOptions?: ResourceLibraryPickerOption[];
  page: number;
  pageCount: number;
  showClear?: boolean;
  variant?: "default" | "prep-dialog";
  className?: string;
  listClassName?: string;
  onSearch: (value: string) => void;
  onType: (value: string) => void;
  onPage: (value: number) => void;
  onSelect: (id: string) => void;
  onClear?: () => void;
  isLoading?: boolean;
}) {
  const panelClassName = variant === "prep-dialog"
    ? "resource-library-picker-panel--prep-dialog"
    : undefined;
  const panelListClassName = variant === "prep-dialog"
    ? "resource-library-picker__list--prep-dialog"
    : undefined;
  return (
    <AppPanel className={cn(panelClassName, className)} bodyClassName="resource-library-picker">
      <ResourceLibraryPickerHeader title={title} clearLabel={clearLabel} showClear={showClear} onClear={onClear} />

      <ResourceLibraryPickerToolbar
        search={search}
        type={type}
        typeOptions={typeOptions}
        searchIcon={searchIcon}
        searchPlaceholder={searchPlaceholder}
        onSearch={onSearch}
        onType={onType}
      />

      <ResourceLibraryPickerList
        items={items}
        selectedLabel={selectedLabel}
        loadingLabel={loadingLabel}
        emptyLabel={emptyLabel}
        className={cn(panelListClassName, listClassName)}
        isLoading={isLoading}
        onSelect={onSelect}
      />

      <AppPager
        className="resource-library-picker__pager"
        page={page}
        pageCount={pageCount}
        summary={pageSummary}
        previousLabel={previousLabel}
        nextLabel={nextLabel}
        onPage={onPage}
      />
    </AppPanel>
  );
}
