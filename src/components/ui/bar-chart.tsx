"use client";

import { useMemo } from "react";

interface DataPoint {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  defaultColor?: string;
  horizontal?: boolean;
  showValues?: boolean;
  showGrid?: boolean;
  yAxisLabel?: string;
  xAxisLabel?: string;
}

export function BarChart({
  data,
  width = 600,
  height = 300,
  defaultColor = "#3B82F6",
  horizontal = false,
  showValues = true,
  showGrid = true,
  yAxisLabel,
  xAxisLabel,
}: BarChartProps) {
  const padding = { top: 20, right: 20, bottom: 60, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const { bars, maxValue, yTicks } = useMemo(() => {
    if (data.length === 0) return { bars: [], maxValue: 100, yTicks: [] };

    const values = data.map((d) => d.value);
    const max = Math.max(...values, 1);

    // Generate y-axis ticks
    const tickCount = 5;
    const ticks = Array.from({ length: tickCount }, (_, i) => {
      const value = (max * i) / (tickCount - 1);
      return Math.round(value * 10) / 10;
    });

    const barWidth = chartWidth / data.length - 10;
    const barGap = 10;

    const barData = data.map((d, i) => {
      const barHeight = (d.value / max) * chartHeight;
      const x = padding.left + i * (barWidth + barGap) + barGap / 2;
      const y = padding.top + chartHeight - barHeight;

      return {
        x,
        y,
        width: barWidth,
        height: barHeight,
        value: d.value,
        label: d.label,
        color: d.color || defaultColor,
      };
    });

    return { bars: barData, maxValue: max, yTicks: ticks };
  }, [data, chartWidth, chartHeight, padding, defaultColor]);

  return (
    <div className="relative">
      <svg width={width} height={height} className="overflow-visible">
        {/* Grid lines */}
        {showGrid &&
          yTicks.map((tick, i) => {
            const y = padding.top + chartHeight - (tick / maxValue) * chartHeight;
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

        {/* Bars */}
        {bars.map((bar, i) => (
          <g key={i}>
            <rect
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              fill={bar.color}
              rx="4"
              className="transition-all duration-300 hover:opacity-80 cursor-pointer"
            >
              <title>{`${bar.label}: ${bar.value}`}</title>
            </rect>
            {showValues && bar.height > 20 && (
              <text
                x={bar.x + bar.width / 2}
                y={bar.y + 16}
                textAnchor="middle"
                className="text-xs font-semibold fill-white"
              >
                {bar.value}
              </text>
            )}
          </g>
        ))}

        {/* X-axis labels */}
        {bars.map((bar, i) => (
          <text
            key={i}
            x={bar.x + bar.width / 2}
            y={padding.top + chartHeight + 20}
            textAnchor="end"
            transform={`rotate(-45 ${bar.x + bar.width / 2} ${padding.top + chartHeight + 20})`}
            className="text-xs fill-muted-foreground"
          >
            {bar.label}
          </text>
        ))}

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
