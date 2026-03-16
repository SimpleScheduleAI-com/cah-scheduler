"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface SplitViewProps {
  leftContent: React.ReactNode
  rightContent: React.ReactNode
  leftTitle: string
  rightTitle: string
  onClose?: () => void
}

export function SplitView({
  leftContent,
  rightContent,
  leftTitle,
  rightTitle,
  onClose,
}: SplitViewProps) {
  const [dividerPosition, setDividerPosition] = useState(50)
  const [isDragging, setIsDragging] = useState(false)

  const handleMouseDown = () => {
    setIsDragging(true)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return

    const container = e.currentTarget.getBoundingClientRect()
    const percentage = ((e.clientX - container.left) / container.width) * 100
    setDividerPosition(Math.max(20, Math.min(80, percentage)))
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-background animate-fade-in"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-6 border-b bg-muted/30">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Split View Comparison</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span>{leftTitle}</span>
            </div>
            <span>vs</span>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <span>{rightTitle}</span>
            </div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </Button>
      </div>

      {/* Split panels */}
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Left panel */}
        <div
          className="overflow-auto border-r-2 border-blue-500/30 bg-gradient-to-br from-blue-50/30 to-transparent dark:from-blue-950/10"
          style={{ width: `${dividerPosition}%` }}
        >
          <div className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <h3 className="font-semibold">{leftTitle}</h3>
            </div>
            {leftContent}
          </div>
        </div>

        {/* Draggable divider */}
        <div
          className={cn(
            "relative w-1 cursor-col-resize bg-border hover:bg-primary transition-colors group",
            isDragging && "bg-primary"
          )}
          onMouseDown={handleMouseDown}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-12 rounded-lg bg-card border-2 border-primary shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <path d="M8 3v18"/><path d="M16 3v18"/>
            </svg>
          </div>
        </div>

        {/* Right panel */}
        <div
          className="overflow-auto border-l-2 border-purple-500/30 bg-gradient-to-bl from-purple-50/30 to-transparent dark:from-purple-950/10"
          style={{ width: `${100 - dividerPosition}%` }}
        >
          <div className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <h3 className="font-semibold">{rightTitle}</h3>
            </div>
            {rightContent}
          </div>
        </div>
      </div>

      {/* Keyboard hint */}
      <div className="fixed bottom-4 right-4 px-3 py-2 rounded-lg bg-card border shadow-lg text-xs text-muted-foreground animate-fade-in">
        <div className="flex items-center gap-2">
          <span>Drag divider to resize</span>
          <span className="text-primary">|</span>
          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">ESC</kbd>
            <span>to exit</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function useSplitView() {
  const [isOpen, setIsOpen] = useState(false)

  const open = () => setIsOpen(true)
  const close = () => setIsOpen(false)
  const toggle = () => setIsOpen(!isOpen)

  return { isOpen, open, close, toggle }
}
