"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"

interface Shortcut {
  key: string
  description: string
  category?: string
}

const shortcuts: Shortcut[] = [
  { key: "⌘ K", description: "Open command palette", category: "Navigation" },
  { key: "?", description: "Show keyboard shortcuts", category: "Navigation" },
  { key: "Esc", description: "Close dialog/modal", category: "Navigation" },
  { key: "↑ ↓", description: "Navigate lists", category: "Navigation" },
  { key: "↵", description: "Select/confirm", category: "Navigation" },
  { key: "⌘ S", description: "Save changes", category: "Actions" },
  { key: "⌘ P", description: "Print schedule", category: "Actions" },
  { key: "⌘ F", description: "Search", category: "Actions" },
]

export function KeyboardShortcutsPanel() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        // Check if we're not in an input/textarea
        const target = e.target as HTMLElement
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
          return
        }
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === "Escape") {
        setOpen(false)
      }
    }

    // Sidebar Help menu opens this panel without the keyboard shortcut.
    const openViaEvent = () => setOpen(true)

    document.addEventListener("keydown", down)
    window.addEventListener("open-keyboard-shortcuts", openViaEvent)
    return () => {
      document.removeEventListener("keydown", down)
      window.removeEventListener("open-keyboard-shortcuts", openViaEvent)
    }
  }, [])

  if (!open) return null

  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    const category = shortcut.category || "Other"
    if (!acc[category]) acc[category] = []
    acc[category].push(shortcut)
    return acc
  }, {} as Record<string, Shortcut[]>)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div className="relative w-full max-w-2xl mx-4 bg-card rounded-xl shadow-2xl border-2 border-primary/20 overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="gradient-hero p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">Keyboard Shortcuts</h2>
              <p className="text-sm text-white/80 mt-1">Quick reference for power users</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/80 hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Shortcuts */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
            <div key={category} className="mb-6 last:mb-0">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                {category}
              </h3>
              <div className="space-y-2">
                {categoryShortcuts.map((shortcut, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.key.split(" ").map((key, j) => (
                        <kbd
                          key={j}
                          className="px-2.5 py-1.5 text-xs font-semibold bg-background rounded border-2 border-primary/20 shadow-sm"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center px-6 py-4 border-t bg-muted/30 text-xs text-muted-foreground">
          <span>Press</span>
          <kbd className="mx-1.5 px-2 py-0.5 bg-background rounded border">?</kbd>
          <span>to toggle this panel</span>
        </div>
      </div>
    </div>
  )
}
