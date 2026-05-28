import { useEffect } from "react";

type AppShellSurfaceBackgrounds = {
  center?: string;
  left?: string;
  right?: string;
  header?: string;
};

const STYLE_VARS: Array<[keyof AppShellSurfaceBackgrounds, string]> = [
  ["center", "--ms-app-shell-slot-center-background"],
  ["left", "--ms-app-shell-slot-left-background"],
  ["right", "--ms-app-shell-slot-right-background"],
  ["header", "--ms-app-window-header-background"],
];

function setStyleVariable(name: string, value?: string) {
  if (typeof document === "undefined") return;
  const rootStyle = document.documentElement.style;
  if (value == null || value === "") {
    rootStyle.removeProperty(name);
    return;
  }
  rootStyle.setProperty(name, value);
}

/**
 * Declares the page-level shell chrome background for the active route.
 *
 * The shell reads these override variables as fallbacks for its own default
 * surface colors, so a page can keep its content area and header aligned
 * without reaching into the DOM tree.
 */
export function useAppShellSurfaceBackground(backgrounds: AppShellSurfaceBackgrounds = {}) {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const rootStyle = document.documentElement.style;
    const previousValues = new Map<string, string>();

    for (const [key, cssVar] of STYLE_VARS) {
      previousValues.set(cssVar, rootStyle.getPropertyValue(cssVar));
      setStyleVariable(cssVar, backgrounds[key]);
    }

    return () => {
      for (const [, cssVar] of STYLE_VARS) {
        const previousValue = previousValues.get(cssVar);
        setStyleVariable(cssVar, previousValue?.trim() ? previousValue : undefined);
      }
    };
  }, [backgrounds.center, backgrounds.header, backgrounds.left, backgrounds.right]);
}
