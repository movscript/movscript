export type LayoutChrome =
  | "workspace"
  | "immersive"
  | "canvas"
  | "split"
  | "dock"
  | "floating";

export type LayoutChildChrome = "flush" | "section" | "card";

export interface LayoutChromeContract {
  owner: "app-shell" | "workspace" | "split-layout" | "dock-panel" | "floating-panel" | "canvas";
  outerBorder: boolean;
  outerRadius: boolean;
  internalDividers: boolean;
  childDefaultChrome: LayoutChildChrome;
}

export const layoutChromeContracts: Record<LayoutChrome, LayoutChromeContract> = {
  workspace: {
    owner: "workspace",
    outerBorder: false,
    outerRadius: false,
    internalDividers: false,
    childDefaultChrome: "section",
  },
  immersive: {
    owner: "workspace",
    outerBorder: false,
    outerRadius: false,
    internalDividers: true,
    childDefaultChrome: "flush",
  },
  canvas: {
    owner: "canvas",
    outerBorder: false,
    outerRadius: false,
    internalDividers: false,
    childDefaultChrome: "flush",
  },
  split: {
    owner: "split-layout",
    outerBorder: false,
    outerRadius: false,
    internalDividers: true,
    childDefaultChrome: "flush",
  },
  dock: {
    owner: "dock-panel",
    outerBorder: false,
    outerRadius: false,
    internalDividers: true,
    childDefaultChrome: "flush",
  },
  floating: {
    owner: "floating-panel",
    outerBorder: true,
    outerRadius: true,
    internalDividers: true,
    childDefaultChrome: "flush",
  },
};
