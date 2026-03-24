"use client"

import { useEffect, useRef, useState, useReducer } from "react"

interface ConfettiProps {
  active: boolean
  onComplete?: () => void
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  color: string
  rotation: number
  rotationSpeed: number
  size: number
}

export function Confetti({ active, onComplete }: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!active) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const colors = [
      "#3B82F6", // teal
      "#06b6d4", // cyan
      "#3b82f6", // blue
      "#8b5cf6", // purple
      "#ec4899", // pink
      "#f59e0b", // amber
      "#10b981", // green
    ]

    const particles: Particle[] = []
    const particleCount = 150

    // Create particles
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        vx: (Math.random() - 0.5) * 8,
        vy: Math.random() * 3 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        size: Math.random() * 8 + 4,
      })
    }

    let animationId: number
    let startTime = Date.now()
    const duration = 3000

    function animate() {
      if (!ctx || !canvas) return

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const elapsed = Date.now() - startTime
      if (elapsed > duration) {
        onComplete?.()
        return
      }

      particles.forEach((particle) => {
        particle.x += particle.vx
        particle.y += particle.vy
        particle.vy += 0.1 // gravity
        particle.rotation += particle.rotationSpeed

        ctx.save()
        ctx.translate(particle.x, particle.y)
        ctx.rotate((particle.rotation * Math.PI) / 180)
        ctx.fillStyle = particle.color
        ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size)
        ctx.restore()
      })

      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      if (animationId) cancelAnimationFrame(animationId)
    }
  }, [active, onComplete])

  if (!active) return null

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-50"
      style={{ width: "100vw", height: "100vh" }}
    />
  )
}

export function useConfetti() {
  const [active, setActive] = useState(false)

  const fire = () => {
    setActive(true)
  }

  const handleComplete = () => {
    setActive(false)
  }

  return {
    fire,
    ConfettiComponent: () => <Confetti active={active} onComplete={handleComplete} />,
  }
}
