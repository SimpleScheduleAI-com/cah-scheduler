"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { Button } from "./button"
import { cn } from "@/lib/utils"

interface TourStep {
  target: string // CSS selector
  title: string
  description: string
  placement?: "top" | "bottom" | "left" | "right"
}

interface OnboardingTourProps {
  steps: TourStep[]
  onComplete: () => void
  onSkip: () => void
}

export function OnboardingTour({ steps, onComplete, onSkip }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    const step = steps[currentStep]
    if (!step) return

    const element = document.querySelector(step.target)
    if (element) {
      const rect = element.getBoundingClientRect()
      setTargetRect(rect)
      // Scroll element into view
      element.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [currentStep, steps])

  if (currentStep >= steps.length) {
    onComplete()
    return null
  }

  const step = steps[currentStep]
  if (!targetRect) return null

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      onComplete()
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  // Calculate tooltip position
  const placement = step.placement || "bottom"
  let tooltipStyle: React.CSSProperties = {}

  switch (placement) {
    case "bottom":
      tooltipStyle = {
        top: targetRect.bottom + 20,
        left: targetRect.left + targetRect.width / 2,
        transform: "translateX(-50%)",
      }
      break
    case "top":
      tooltipStyle = {
        bottom: window.innerHeight - targetRect.top + 20,
        left: targetRect.left + targetRect.width / 2,
        transform: "translateX(-50%)",
      }
      break
    case "left":
      tooltipStyle = {
        top: targetRect.top + targetRect.height / 2,
        right: window.innerWidth - targetRect.left + 20,
        transform: "translateY(-50%)",
      }
      break
    case "right":
      tooltipStyle = {
        top: targetRect.top + targetRect.height / 2,
        left: targetRect.right + 20,
        transform: "translateY(-50%)",
      }
      break
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay with spotlight */}
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onSkip}>
        {/* Spotlight cutout */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            <mask id="spotlight-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={targetRect.left - 8}
                y={targetRect.top - 8}
                width={targetRect.width + 16}
                height={targetRect.height + 16}
                rx="12"
                fill="black"
              />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="black" mask="url(#spotlight-mask)" />
        </svg>

        {/* Highlight ring */}
        <div
          className="absolute border-4 border-primary rounded-xl shadow-2xl pointer-events-none animate-pulse-slow"
          style={{
            left: targetRect.left - 8,
            top: targetRect.top - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
          }}
        />
      </div>

      {/* Tooltip */}
      <div
        className="absolute w-96 max-w-[90vw] bg-card border-2 border-primary rounded-xl shadow-2xl p-6 animate-scale-in"
        style={tooltipStyle}
      >
        {/* Progress dots */}
        <div className="flex gap-1.5 mb-4">
          {steps.map((_, index) => (
            <div
              key={index}
              className={cn(
                "h-1.5 rounded-full transition-all",
                index === currentStep
                  ? "w-8 gradient-primary"
                  : index < currentStep
                  ? "w-1.5 bg-primary/50"
                  : "w-1.5 bg-muted"
              )}
            />
          ))}
        </div>

        {/* Content */}
        <h3 className="text-lg font-bold mb-2">{step.title}</h3>
        <p className="text-sm text-muted-foreground mb-6">{step.description}</p>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={onSkip}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button variant="outline" size="sm" onClick={handlePrevious}>
                Previous
              </Button>
            )}
            <Button size="sm" onClick={handleNext}>
              {currentStep === steps.length - 1 ? "Finish" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function useOnboardingTour() {
  const [isActive, setIsActive] = useState(false)
  const [hasSeenTour, setHasSeenTour] = useState(false)

  useEffect(() => {
    // Check if user has seen tour
    const seen = localStorage.getItem("onboarding-tour-completed")
    setHasSeenTour(seen === "true")
  }, [])

  const startTour = () => {
    setIsActive(true)
  }

  const completeTour = () => {
    setIsActive(false)
    localStorage.setItem("onboarding-tour-completed", "true")
    setHasSeenTour(true)
  }

  const skipTour = () => {
    setIsActive(false)
    localStorage.setItem("onboarding-tour-completed", "true")
    setHasSeenTour(true)
  }

  const resetTour = () => {
    localStorage.removeItem("onboarding-tour-completed")
    setHasSeenTour(false)
    setIsActive(true)
  }

  return {
    isActive,
    hasSeenTour,
    startTour,
    completeTour,
    skipTour,
    resetTour,
  }
}
