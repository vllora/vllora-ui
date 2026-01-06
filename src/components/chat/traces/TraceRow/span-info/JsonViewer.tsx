import ReactJson from "react-json-view";
import React, { useMemo, memo } from "react";
import type { CSSProperties } from "react";

type JsonViewerProps = {
  data: unknown;
  style?: CSSProperties;
  collapseStringsAfterLength?: number;
  collapsed?: number;
};

// Static theme object - defined outside component to avoid recreation on each render
const JSON_VIEWER_THEME = {
  base00: "transparent",
  base01: "#ffffff20",
  base02: "#ffffff30",
  base03: "#ffffff40",
  base04: "#ffffff60",
  base05: "#ffffff80",
  base06: "#ffffffa0",
  base07: "#ffffffc0",
  base08: "#ff8c8c",
  base09: "#ffd700",
  base0A: "#ffeb3b",
  base0B: "#4caf50",
  base0C: "#00bcd4",
  base0D: "#2196f3",
  base0E: "#9c27b0",
  base0F: "#ff9800",
} as const;

// Static wrapper style
const WRAPPER_STYLE = { wordWrap: "break-word", whiteSpace: "pre-wrap" } as const;

export const JsonViewer: React.FC<JsonViewerProps> = memo(({
  data,
  style,
  collapseStringsAfterLength,
  collapsed,
}) => {
  const normalizedData = useMemo((): object => {
    return data && typeof data === "object"
      ? (data as object)
      : { value: data };
  }, [data]);

  return (
    <div style={WRAPPER_STYLE}>
      <ReactJson
        src={normalizedData}
        theme={JSON_VIEWER_THEME}
        style={style}
        collapseStringsAfterLength={collapseStringsAfterLength ?? 500}
        collapsed={collapsed ?? 2}
        enableClipboard
        displayDataTypes={false}
        displayObjectSize={false}
      />
    </div>
  );
});