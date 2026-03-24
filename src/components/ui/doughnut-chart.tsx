import { cn } from "@/lib/utils"

interface DoughnutChartProps {
  percentage: number
  size?: number
  strokeWidth?: number
  className?: string
  showLabel?: boolean
  color?: string
}

export function DoughnutChart({
  percentage,
  size = 120,
  strokeWidth = 12,
  className,
  showLabel = true,
  color,
}: DoughnutChartProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percentage / 100) * circumference

  // Color based on percentage
  const getColor = () => {
    if (color) return color
    if (percentage >= 80) return "url(#gradient-success)"
    if (percentage >= 60) return "url(#gradient-warning)"
    return "url(#gradient-danger)"
  }

  const getGradientColors = () => {
    if (percentage >= 80) return { start: "#10b981", end: "#059669" }
    if (percentage >= 60) return { start: "#f59e0b", end: "#d97706" }
    return { start: "#ef4444", end: "#dc2626" }
  }

  const gradient = getGradientColors()

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="transform -rotate-90">
        <defs>
          <linearGradient id="gradient-success" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <linearGradient id="gradient-warning" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id="gradient-danger" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>

        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-muted"
        />

        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={getColor()}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
          }}
        />
      </svg>

      {/* Center label */}
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold">{Math.round(percentage)}%</span>
          <span className="text-xs text-muted-foreground mt-1">Fill Rate</span>
        </div>
      )}
    </div>
  )
}
