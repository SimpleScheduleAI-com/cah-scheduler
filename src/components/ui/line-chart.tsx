"use client";

import { useMemo } from "react";

interface DataPoint {
  label: string;
  value: number;
}

interface LineChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  color?: string;
  showGrid?: boolean;
  showLabels?: boolean;
  showDots?: boolean;
  fillArea?: boolean;
  yAxisLabel?: string;
  xAxisLabel?: string;
}

export function LineChart({
  data,
  width = 600,
  height = 300,
  color = "#3B82F6",
  showGrid = true,
  showLabels = true,
  showDots = true,
  fillArea = false,
  yAxisLabel,
  xAxisLabel,
}: LineChartProps) {
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const { points, path, areaPath, minValue, maxValue, yTicks } = useMemo(() => {
    if (data.length === 0) return { points: [], path: "", areaPath: "", minValue: 0, maxValue: 100, yTicks: [] };

    const values = data.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    // Generate y-axis ticks
    const tickCount = 5;
    const ticks = Array.from({ length: tickCount }, (_, i) => {
      const value = min + (range * i) / (tickCount - 1);
      return Math.round(value * 10) / 10;
    });

    const pts = data.map((d, i) => {
      const x = padding.left + (i / (data.length - 1 || 1)) * chartWidth;
      const y = padding.top + chartHeight - ((d.value - min) / range) * chartHeight;
      return { x, y, value: d.value, label: d.label };
    });

    const pathStr = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

    const areaPathStr = fillArea
      ? `${pathStr} L ${pts[pts.length - 1].x} ${padding.top + chartHeight} L ${pts[0].x} ${padding.top + chartHeight} Z`
      : "";

    return { points: pts, path: pathStr, areaPath: areaPathStr, minValue: min, maxValue: max, yTicks: ticks };
  }, [data, chartWidth, chartHeight, padding, fillArea]);

  return (
    <div className="relative">
      <svg width={width} height={height} className="overflow-visible">
        {/* Grid lines */}
        {showGrid &&
          yTicks.map((tick, i) => {
            const y = padding.top + chartHeight - ((tick - minValue) / (maxValue - minValue || 1)) * chartHeight;
            return (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={padding.left + chartWidth}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text x={padding.left - 10} y={y + 4} textAnchor="end" className="text-xs fill-muted-foreground">
                  {tick}
                </text>
              </g>
            );
          })}

        {/* Area fill */}
        {fillArea && areaPath && (
          <path d={areaPath} fill={color} fillOpacity="0.1" />
        )}

        {/* Line */}
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Data points */}
        {showDots &&
          points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="4" fill="white" stroke={color} strokeWidth="2.5" />
              <circle cx={p.x} cy={p.y} r="8" fill="transparent" className="cursor-pointer">
                <title>{`${p.label}: ${p.value}`}</title>
              </circle>
            </g>
          ))}

        {/* X-axis labels */}
        {showLabels &&
          data.map((d, i) => {
            const x = padding.left + (i / (data.length - 1 || 1)) * chartWidth;
            const showLabel = data.length <= 10 || i % Math.ceil(data.length / 10) === 0;
            return showLabel ? (
              <text
                key={i}
                x={x}
                y={padding.top + chartHeight + 20}
                textAnchor="middle"
                className="text-xs fill-muted-foreground"
              >
                {d.label}
              </text>
            ) : null;
          })}

        {/* Axes */}
        <line
          x1={padding.left}
          y1={padding.top + chartHeight}
          x2={padding.left + chartWidth}
          y2={padding.top + chartHeight}
          stroke="#d1d5db"
          strokeWidth="1"
        />
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={padding.top + chartHeight}
          stroke="#d1d5db"
          strokeWidth="1"
        />

        {/* Axis labels */}
        {yAxisLabel && (
          <text
            x={15}
            y={padding.top + chartHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90 15 ${padding.top + chartHeight / 2})`}
            className="text-xs font-medium fill-muted-foreground"
          >
            {yAxisLabel}
          </text>
        )}
        {xAxisLabel && (
          <text
            x={padding.left + chartWidth / 2}
            y={height - 5}
            textAnchor="middle"
            className="text-xs font-medium fill-muted-foreground"
          >
            {xAxisLabel}
          </text>
        )}
      </svg>
    </div>
  );
}
