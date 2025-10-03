import ReactJson from "react-json-view";
import type { CSSProperties } from "react";

type JsonViewerProps = {
  data: unknown;
  style?: CSSProperties;
  collapseStringsAfterLength?: number;
  collapsed?: number;
};

export const JsonViewer: React.FC<JsonViewerProps> = ({
  data,
  style,
  collapseStringsAfterLength,
  collapsed,
}) => {
  const normalizedData: object =
    data && typeof data === "object"
      ? (data as object)
      : { value: data };

  return (
    <div style={{ wordWrap: "break-word", whiteSpace: "pre-wrap" }}>
      <ReactJson
        src={normalizedData}
        theme={{
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
        }}
        style={{
          ...style,
        }}
        collapseStringsAfterLength={collapseStringsAfterLength ?? 50}
        collapsed={collapsed ?? 2}
        enableClipboard
        displayDataTypes={false}
        displayObjectSize={false}
      />
    </div>
  );
};