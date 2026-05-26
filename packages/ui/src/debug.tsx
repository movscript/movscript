"use client";

import * as React from "react";

const UI_DEBUG_STORAGE_KEY = "ms.ui.debug";
const UI_DEBUG_SELECTOR = "[data-ms-component]";

type UiDebugTarget = {
  element: HTMLElement;
  rect: DOMRect;
  rows: Array<[string, string]>;
};

declare global {
  interface Window {
    __MOVSCRIPT_UI_DEBUG__?: {
      enable: () => void;
      disable: () => void;
      toggle: () => void;
      isEnabled: () => boolean;
    };
  }
}

export function isUiDebugEnabled() {
  if (typeof window === "undefined") return false;

  const params = new URLSearchParams(window.location.search);
  const queryValue = params.get("uiDebug") ?? params.get("msUiDebug");
  if (queryValue === "1" || queryValue === "true") return true;
  if (queryValue === "0" || queryValue === "false") return false;

  return (
    window.localStorage.getItem(UI_DEBUG_STORAGE_KEY) === "1" ||
    document.documentElement.dataset.msUiDebug === "true"
  );
}

export function setUiDebugEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  if (enabled) {
    window.localStorage.setItem(UI_DEBUG_STORAGE_KEY, "1");
    document.documentElement.dataset.msUiDebug = "true";
  } else {
    window.localStorage.removeItem(UI_DEBUG_STORAGE_KEY);
    delete document.documentElement.dataset.msUiDebug;
  }
  window.dispatchEvent(new CustomEvent("ms-ui-debug-change", { detail: { enabled } }));
}

export function UiDebugInspector() {
  const [enabled, setEnabled] = React.useState(false);
  const [target, setTarget] = React.useState<UiDebugTarget | null>(null);

  React.useEffect(() => {
    const updateEnabled = () => {
      const nextEnabled = isUiDebugEnabled();
      setEnabled(nextEnabled);
      if (!nextEnabled) setTarget(null);
    };

    window.__MOVSCRIPT_UI_DEBUG__ = {
      enable: () => setUiDebugEnabled(true),
      disable: () => setUiDebugEnabled(false),
      toggle: () => setUiDebugEnabled(!isUiDebugEnabled()),
      isEnabled: isUiDebugEnabled
    };

    updateEnabled();
    window.addEventListener("storage", updateEnabled);
    window.addEventListener("ms-ui-debug-change", updateEnabled);
    return () => {
      window.removeEventListener("storage", updateEnabled);
      window.removeEventListener("ms-ui-debug-change", updateEnabled);
    };
  }, []);

  React.useEffect(() => {
    if (!enabled) return;

    let frame = 0;
    const inspect = (event: PointerEvent) => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const rawTarget = event.target;
        if (!(rawTarget instanceof Element)) {
          setTarget(null);
          return;
        }
        if (rawTarget.closest("[data-ms-ui-inspector]")) return;
        const element = rawTarget.closest(UI_DEBUG_SELECTOR);
        if (!(element instanceof HTMLElement)) {
          setTarget(null);
          return;
        }
        setTarget(readTarget(element));
      });
    };

    const clear = () => setTarget(null);

    window.addEventListener("pointermove", inspect, { passive: true });
    window.addEventListener("scroll", clear, true);
    window.addEventListener("resize", clear);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", inspect);
      window.removeEventListener("scroll", clear, true);
      window.removeEventListener("resize", clear);
    };
  }, [enabled]);

  if (!enabled || !target) return null;

  const tooltipStyle = tooltipPosition(target.rect);

  return (
    <div data-ms-ui-inspector="" style={containerStyle} aria-hidden="true">
      <div
        style={{
          ...outlineStyle,
          left: target.rect.left,
          top: target.rect.top,
          width: target.rect.width,
          height: target.rect.height
        }}
      />
      <div style={{ ...tooltipStyleBase, ...tooltipStyle }}>
        <div style={tooltipTitleStyle}>{target.rows[0]?.[1] ?? "MovScript UI"}</div>
        {target.rows.slice(1).map(([label, value]) => (
          <div key={label} style={tooltipRowStyle}>
            <span style={tooltipLabelStyle}>{label}</span>
            <span style={tooltipValueStyle}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function readTarget(element: HTMLElement): UiDebugTarget {
  const computed = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const dataset = element.dataset;
  const className = typeof element.className === "string" ? element.className : "";
  const rows: Array<[string, string]> = [
    ["component", dataset.msComponent ?? element.tagName.toLowerCase()],
    ["slot", dataset.msSlot ?? "root"]
  ];

  appendRow(rows, "variant", dataset.msVariant);
  appendRow(rows, "size", dataset.msSize ?? dataset.size);
  appendRow(rows, "state", dataset.state);
  appendRow(rows, "invalid", dataset.invalid);
  appendRow(rows, "disabled", dataset.disabled);
  appendRow(rows, "tone", dataset.msTone);
  rows.push(["box", `${Math.round(rect.width)} x ${Math.round(rect.height)}`]);
  rows.push(["font", `${computed.fontSize} / ${computed.lineHeight}`]);
  rows.push(["color", computed.color]);
  rows.push(["bg", computed.backgroundColor]);
  rows.push(["radius", computed.borderRadius]);
  if (className) rows.push(["class", className]);

  return { element, rect, rows };
}

function appendRow(rows: Array<[string, string]>, label: string, value: string | undefined) {
  if (value) rows.push([label, value]);
}

function tooltipPosition(rect: DOMRect): React.CSSProperties {
  const width = 280;
  const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - width - 12));
  const top = rect.bottom + 10 < window.innerHeight - 80 ? rect.bottom + 10 : Math.max(12, rect.top - 10);
  const transform = rect.bottom + 10 < window.innerHeight - 80 ? undefined : "translateY(-100%)";
  return { left, top, width, transform };
}

const containerStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2147483647,
  pointerEvents: "none"
};

const outlineStyle: React.CSSProperties = {
  position: "fixed",
  border: "1px solid #38bdf8",
  boxShadow: "0 0 0 1px rgb(8 47 73 / 0.65), 0 0 0 4px rgb(56 189 248 / 0.18)",
  borderRadius: 4
};

const tooltipStyleBase: React.CSSProperties = {
  position: "fixed",
  maxWidth: "calc(100vw - 24px)",
  border: "1px solid rgb(56 189 248 / 0.45)",
  borderRadius: 8,
  background: "rgb(8 13 18 / 0.96)",
  color: "#e5f5ff",
  boxShadow: "0 16px 48px rgb(0 0 0 / 0.35)",
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 11,
  lineHeight: "15px",
  padding: "8px 10px"
};

const tooltipTitleStyle: React.CSSProperties = {
  marginBottom: 6,
  color: "#7dd3fc",
  fontSize: 12,
  fontWeight: 700
};

const tooltipRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "58px minmax(0, 1fr)",
  gap: 8,
  alignItems: "baseline"
};

const tooltipLabelStyle: React.CSSProperties = {
  color: "#93a4b7"
};

const tooltipValueStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  color: "#f8fafc",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};
