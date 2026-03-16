import { cn } from "@/lib/utils"

interface CircularProgressProps {
  value: number
  max?: number
  size?: "sm" | "md" | "lg"
  showValue?: boolean
  className?: string
  color?: "primary" | "success" | "warning" | "danger"
}

const sizeMap = {
  sm: { width: 60, stroke: 4, fontSize: "text-xs" },
  md: { width: 80, stroke: 5, fontSize: "text-sm" },
  lg: { width: 120, stroke: 6, fontSize: "text-lg" },
}

const colorMap = {
  primary: "text-primary",
  success: "text-green-500",
  warning: "text-yellow-500",
  danger: "text-red-500",
}

export function CircularProgress({
  value,
  max = 100,
  size = "md",
  showValue = true,
  className,
  color = "primary",
}: CircularProgressProps) {
  const { width, stroke, fontSize } = sizeMap[size]
  const percentage = Math.min(100, (value / max) * 100)
  const radius = (width - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percentage / 100) * circumference

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={width} height={width} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={width / 2}
          cy={width / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          className="text-muted"
        />
        {/* Progress circle */}
        <circle
          cx={width / 2}
          cy={width / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          className={cn("transition-all duration-500", colorMap[color])}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
          }}
        />
      </svg>
      {showValue && (
        <div className={cn("absolute font-bold", fontSize, colorMap[color])}>
          {Math.round(percentage)}%
        </div>
      )}
    </div>
  )
}
