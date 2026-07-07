import { useId } from "react";

export interface AreaSeries {
  values: number[];
  color: string;
  /** Draw a gradient area under the line (default true). */
  fill?: boolean;
}

/**
 * Responsive multi-series area chart. Scales to its container width via a
 * normalised viewBox; strokes stay crisp through non-scaling-stroke.
 */
export function AreaChart({
  series,
  height = 120,
  className = "",
}: {
  series: AreaSeries[];
  height?: number;
  className?: string;
}) {
  const gradientId = useId();
  const drawable = series.filter((s) => s.values.length >= 2);
  if (drawable.length === 0) {
    return <div className={className} style={{ height }} />;
  }
  const all = drawable.flatMap((s) => s.values);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min || 1) * 0.06;
  const lo = min - pad;
  const range = max + pad - lo;

  const toPoints = (values: number[]) =>
    values
      .map(
        (v, i) =>
          `${((i / (values.length - 1)) * 100).toFixed(2)},${(100 - ((v - lo) / range) * 100).toFixed(2)}`,
      )
      .join(" ");

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={`w-full ${className}`}
      style={{ height }}
      aria-hidden
    >
      <defs>
        {drawable.map((s, i) => (
          <linearGradient key={i} id={`${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {drawable.map((s, i) =>
        s.fill === false ? null : (
          <polygon
            key={`fill-${i}`}
            points={`0,100 ${toPoints(s.values)} 100,100`}
            fill={`url(#${gradientId}-${i})`}
          />
        ),
      )}
      {drawable.map((s, i) => (
        <polyline
          key={`line-${i}`}
          points={toPoints(s.values)}
          fill="none"
          stroke={s.color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
