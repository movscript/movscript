import type { ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { Input, NativeSelect } from "../../../../primitives";
import type { ResourceLibraryPickerOption } from "../types";

export function ResourceLibraryPickerToolbar({
  search,
  type,
  typeOptions = [],
  searchIcon,
  searchPlaceholder,
  onSearch,
  onType,
}: {
  search: string;
  type: string;
  typeOptions?: ResourceLibraryPickerOption[];
  searchIcon?: ReactNode;
  searchPlaceholder?: string;
  onSearch: (value: string) => void;
  onType: (value: string) => void;
}) {
  return (
    <div className="resource-library-picker__toolbar">
      <div className="resource-library-picker__search">
        {searchIcon ? <span className="resource-library-picker__search-icon">{searchIcon}</span> : null}
        <Input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          className={cn("resource-library-picker__search-input", searchIcon && "resource-library-picker__search-input--with-icon")}
          placeholder={searchPlaceholder}
        />
      </div>
      {typeOptions.length > 1 ? (
        <NativeSelect
          controlSize="sm"
          className="resource-library-picker__type-select"
          value={type}
          onChange={(event) => onType(event.target.value)}
        >
          {typeOptions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </NativeSelect>
      ) : null}
    </div>
  );
}
