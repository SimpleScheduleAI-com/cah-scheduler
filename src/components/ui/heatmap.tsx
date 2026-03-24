"use client";

import { useMemo } from "react";

interface HeatmapCell {
  row: string;
  col: string;
  value: number;
}

interface HeatmapProps {
  data: HeatmapCell[];
  rows: string[];
  cols: string[];
  width?: number;
  height?: number;
  colorScale?: {
    low: string;
    mid: string;
    high: string;
  };
  showValues?: boolean;
  title?: string;
}

export function Heatmap({
  data,
  rows,
  cols,
  width = 600,
  height = 400,
  colorScale = {
    low: "#dcfce7",
    mid: "#86efac",
    high: "#3B82F6",
  },
  showValues = true,
  title,
}: HeatmapProps) {
  const padding = { top: title ? 40 : 20, right: 20, bottom: 40, left: 120 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const cellWidth = chartWidth / cols.length;
  const cellHeight = chartHeight / rows.length;

  const { cells, minValue, maxValue } = useMemo(() => {
    if (data.length === 0) return { cells: [], minValue: 0, maxValue: 1 };

    const values = data.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);

    const cellData = data.map((d) => {
      const rowIndex = rows.indexOf(d.row);
      const colIndex = cols.indexOf(d.col);
      const x = padding.left + colIndex * cellWidth;
      const y = padding.top + rowIndex * cellHeight;

      // Calculate color based on value
      const normalized = max > min ? (d.value - min) / (max - min) : 0.5;
      let color: string;
      if (normalized < 0.5) {
        // Interpolate between low and mid
        const ratio = normalized * 2;
        color = interpolateColor(colorScale.low, colorScale.mid, ratio);
      } else {
        // Interpolate between mid and high
        const ratio = (normalized - 0.5) * 2;
        color = interpolateColor(colorScale.mid, colorScale.high, ratio);
      }

      return {
        x,
        y,
        width: cellWidth,
        height: cellHeight,
        value: d.value,
        row: d.row,
        col: d.col,
        color,
      };
    });

    return { cells: cellData, minValue: min, maxValue: max };
  }, [data, rows, cols, cellWidth, cellHeight, padding, colorScale]);

  return (
    <div className="relative">
      <svg width={width} height={height} className="overflow-visible">
        {/* Title */}
        {title && (
          <text
            x={width / 2}
            y={20}
            textAnchor="middle"
            className="text-sm font-semibold fill-foreground"
          >
            {title}
          </text>
        )}

        {/* Cells */}
        {cells.map((cell, i) => (
          <g key={i}>
            <rect
              x={cell.x}
              y={cell.y}
              width={cell.width - 2}
              height={cell.height - 2}
              fill={cell.color}
              rx="2"
              className="transition-all duration-200 hover:opacity-80 cursor-pointer"
            >
              <title>{`${cell.row} - ${cell.col}: ${cell.value}`}</title>
            </rect>
            {showValues && cellWidth > 40 && cellHeight > 30 && (
              <text
                x={cell.x + cell.width / 2}
                y={cell.y + cell.height / 2 + 4}
                textAnchor="middle"
                className="text-xs font-semibold fill-gray-700 pointer-events-none"
              >
                {cell.value}
              </text>
            )}
          </g>
        ))}

        {/* Row labels */}
        {rows.map((row, i) => (
          <text
            key={i}
            x={padding.left - 10}
            y={padding.top + i * cellHeight + cellHeight / 2 + 4}
            textAnchor="end"
            className="text-xs fill-muted-foreground"
          >
            {row}
          </text>
        ))}

        {/* Column labels */}
        {cols.map((col, i) => (
          <text
            key={i}
            x={padding.left + i * cellWidth + cellWidth / 2}
            y={padding.top + chartHeight + 20}
            textAnchor="middle"
            className="text-xs fill-muted-foreground"
          >
            {col}
          </text>
        ))}

        {/* Legend */}
        <g transform={`translate(${width - 120}, ${padding.top})`}>
          <text x={0} y={0} className="text-xs font-medium fill-muted-foreground">
            Scale
          </text>
          <rect x={0} y={10} width={20} height={15} fill={colorScale.low} rx="2" />
          <text x={25} y={22} className="text-xs fill-muted-foreground">
            {minValue}
          </text>
          <rect x={0} y={30} width={20} height={15} fill={colorScale.mid} rx="2" />
          <rect x={0} y={50} width={20} height={15} fill={colorScale.high} rx="2" />
          <text x={25} y={62} className="text-xs fill-muted-foreground">
            {maxValue}
          </text>
        </g>
      </svg>
    </div>
  );
}

// Helper function to interpolate between two hex colors
function interpolateColor(color1: string, color2: string, ratio: number): string {
  const hex = (color: string) => {
    const c = color.replace("#", "");
    return {
      r: parseInt(c.substring(0, 2), 16),
      g: parseInt(c.substring(2, 4), 16),
      b: parseInt(c.substring(4, 6), 16),
    };
  };

  const c1 = hex(color1);
  const c2 = hex(color2);

  const r = Math.round(c1.r + (c2.r - c1.r) * ratio);
  const g = Math.round(c1.g + (c2.g - c1.g) * ratio);
  const b = Math.round(c1.b + (c2.b - c1.b) * ratio);

  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
