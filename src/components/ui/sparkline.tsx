import { cn } from "@/lib/utils"

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  className?: string
  color?: string
  fillColor?: string
  showArea?: boolean
}

export function Sparkline({
  data,
  width = 100,
  height = 24,
  className,
  color = "currentColor",
  fillColor,
  showArea = false,
}: SparklineProps) {
  if (data.length === 0) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width
    const y = height - ((value - min) / range) * height
    return `${x},${y}`
  }).join(" ")

  const areaPoints = showArea
    ? `0,${height} ${points} ${width},${height}`
    : ""

  return (
    <svg
      width={width}
      height={height}
      className={cn("inline-block", className)}
      viewBox={`0 0 ${width} ${height}`}
    >
      {showArea && (
        <polygon
          points={areaPoints}
          fill={fillColor || color}
          fillOpacity="0.2"
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
