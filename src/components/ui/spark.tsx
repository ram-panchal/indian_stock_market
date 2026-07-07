import { useId } from "react";

export function Spark({
  values,
  positive,
  width = 96,
  height = 28,
  fill = false,
}: {
  values: number[];
  positive: boolean;
  width?: number;
  height?: number;
  /** Draw a soft gradient area under the line. */
  fill?: boolean;
}) {
  const gradientId = useId();
  if (values.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / range) * (height - 4)).toFixed(1)}`)
    .join(" ");
  const color = positive ? "var(--up)" : "var(--down)";
  return (
    <svg width={width} height={height} className="shrink-0" aria-hidden>
      {fill ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            points={`0,${height} ${points} ${width},${height}`}
            fill={`url(#${gradientId})`}
          />
        </>
      ) : null}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
