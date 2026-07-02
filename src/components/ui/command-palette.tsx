"use client"

import * as React from "react"
import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

interface Command {
  id: string
  label: string
  description?: string
  icon?: React.ReactNode
  action: () => void
  keywords?: string[]
}

interface CommandPaletteProps {
  commands: Command[]
}

export function CommandPalette({ commands }: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const router = useRouter()

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
      if (e.key === "Escape") {
        setOpen(false)
      }
    }

    // Sidebar Help menu opens the palette without the keyboard shortcut.
    const openViaEvent = () => setOpen(true)

    document.addEventListener("keydown", down)
    window.addEventListener("open-command-palette", openViaEvent)
    return () => {
      document.removeEventListener("keydown", down)
      window.removeEventListener("open-command-palette", openViaEvent)
    }
  }, [])

  const filteredCommands = useMemo(() => {
    if (!search) return commands

    const searchLower = search.toLowerCase()
    return commands.filter((cmd) => {
      const labelMatch = cmd.label.toLowerCase().includes(searchLower)
      const descMatch = cmd.description?.toLowerCase().includes(searchLower)
      const keywordMatch = cmd.keywords?.some((k) => k.toLowerCase().includes(searchLower))
      return labelMatch || descMatch || keywordMatch
    })
  }, [commands, search])

  useEffect(() => {
    setSelectedIndex(0)
  }, [search])

  useEffect(() => {
    if (!open) {
      setSearch("")
      setSelectedIndex(0)
    }
  }, [open])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((i) => (i + 1) % filteredCommands.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action()
        setOpen(false)
      }
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] animate-fade-in">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div className="relative w-full max-w-2xl mx-4 bg-card rounded-xl shadow-2xl border-2 border-primary/20 overflow-hidden animate-scale-in">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b-2 border-primary/10">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search commands..."
            className="flex-1 bg-transparent outline-none text-base placeholder:text-muted-foreground"
            autoFocus
          />
          <kbd className="px-2 py-1 text-xs font-semibold bg-muted rounded border">ESC</kbd>
        </div>

        {/* Commands List */}
        <div className="max-h-[400px] overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No commands found
            </div>
          ) : (
            <div className="space-y-1">
              {filteredCommands.map((cmd, index) => (
                <button
                  key={cmd.id}
                  onClick={() => {
                    cmd.action()
                    setOpen(false)
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all",
                    index === selectedIndex
                      ? "bg-primary text-primary-foreground shadow-md scale-[1.02]"
                      : "hover:bg-accent"
                  )}
                >
                  {cmd.icon && <div className="shrink-0">{cmd.icon}</div>}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{cmd.label}</div>
                    {cmd.description && (
                      <div className={cn(
                        "text-xs truncate",
                        index === selectedIndex ? "text-primary-foreground/80" : "text-muted-foreground"
                      )}>
                        {cmd.description}
                      </div>
                    )}
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn(
                    "shrink-0",
                    index === selectedIndex ? "text-primary-foreground" : "text-muted-foreground"
                  )}>
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-background rounded border">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-background rounded border">↓</kbd>
              <span>Navigate</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-background rounded border">↵</kbd>
              <span>Select</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-background rounded border">⌘</kbd>
            <kbd className="px-1.5 py-0.5 bg-background rounded border">K</kbd>
            <span>Toggle</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function useCommandPalette() {
  const router = useRouter()

  const defaultCommands: Command[] = [
    {
      id: "dashboard",
      label: "Go to Dashboard",
      description: "View overview and metrics",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>,
      action: () => router.push("/dashboard"),
      keywords: ["home", "overview", "metrics"],
    },
    {
      id: "schedule",
      label: "View Schedules",
      description: "Manage scheduling periods",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>,
      action: () => router.push("/schedule"),
      keywords: ["calendar", "shifts", "roster"],
    },
    {
      id: "staff",
      label: "Manage Staff",
      description: "View and edit staff members",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
      action: () => router.push("/staff"),
      keywords: ["employees", "nurses", "team", "people"],
    },
    {
      id: "scenarios",
      label: "Schedule Variants",
      description: "Compare different schedule options",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>,
      action: () => router.push("/scenarios"),
      keywords: ["compare", "options", "alternatives"],
    },
    {
      id: "callouts",
      label: "Callout Management",
      description: "Track and manage staff callouts",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="22" x2="2" y1="2" y2="22"/></svg>,
      action: () => router.push("/callouts"),
      keywords: ["absences", "sick", "emergency"],
    },
    {
      id: "rules",
      label: "Configure Rules",
      description: "Adjust scheduling rules and constraints",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>,
      action: () => router.push("/rules"),
      keywords: ["settings", "configure", "constraints", "policies"],
    },
  ]

  return { commands: defaultCommands }
}
