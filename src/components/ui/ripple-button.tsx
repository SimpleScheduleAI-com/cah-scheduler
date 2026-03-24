"use client"

import * as React from "react"
import { useState, useRef, MouseEvent } from "react"
import { Button } from "./button"
import { cn } from "@/lib/utils"
import type { VariantProps } from "class-variance-authority"
import { buttonVariants } from "./button"

interface RippleEffect {
  x: number
  y: number
  size: number
  key: string
}

export function RippleButton({
  children,
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const [ripples, setRipples] = useState<RippleEffect[]>([])
  const buttonRef = useRef<HTMLButtonElement>(null)

  const createRipple = (event: MouseEvent<HTMLButtonElement>) => {
    const button = buttonRef.current
    if (!button) return

    const rect = button.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height)
    const x = event.clientX - rect.left - size / 2
    const y = event.clientY - rect.top - size / 2
    const key = Date.now().toString()

    const newRipple = { x, y, size, key }
    setRipples((prev) => [...prev, newRipple])

    // Remove ripple after animation
    setTimeout(() => {
      setRipples((prev) => prev.filter((ripple) => ripple.key !== key))
    }, 600)
  }

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    createRipple(event)
    onClick?.(event)
  }

  return (
    <Button
      ref={buttonRef}
      className={cn("relative overflow-hidden", className)}
      onClick={handleClick}
      {...props}
    >
      {children}
      {ripples.map((ripple) => (
        <span
          key={ripple.key}
          className="absolute rounded-full bg-white/30 pointer-events-none animate-ripple"
          style={{
            left: ripple.x,
            top: ripple.y,
            width: ripple.size,
            height: ripple.size,
          }}
        />
      ))}
    </Button>
  )
}
