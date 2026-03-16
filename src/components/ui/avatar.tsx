import { cn } from "@/lib/utils"

interface AvatarProps {
  firstName: string
  lastName: string
  size?: "xs" | "sm" | "md" | "lg"
  className?: string
}

const sizeClasses = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
}

const colors = [
  "bg-blue-500",
  "bg-green-500",
  "bg-yellow-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-orange-500",
]

function getInitials(firstName: string, lastName: string): string {
  return `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase()
}

function getColorFromName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

export function Avatar({ firstName, lastName, size = "sm", className }: AvatarProps) {
  const initials = getInitials(firstName, lastName)
  const color = getColorFromName(firstName + lastName)

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-sm",
        sizeClasses[size],
        color,
        className
      )}
    >
      {initials}
    </div>
  )
}
