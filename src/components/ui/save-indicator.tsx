"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

interface SaveIndicatorProps {
  status: "idle" | "saving" | "saved" | "error"
  className?: string
}

export function SaveIndicator({ status, className }: SaveIndicatorProps) {
  if (status === "idle") return null

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all animate-fade-in",
        status === "saving" && "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
        status === "saved" && "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
        status === "error" && "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
        className
      )}
    >
      {status === "saving" && (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          Saving...
        </>
      )}
      {status === "saved" && (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6 9 17l-5-5"/>
          </svg>
          Saved
        </>
      )}
      {status === "error" && (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>
          </svg>
          Error saving
        </>
      )}
    </div>
  )
}

export function useSaveIndicator() {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")

  const save = async (saveFunction: () => Promise<void>) => {
    setStatus("saving")
    try {
      await saveFunction()
      setStatus("saved")
      setTimeout(() => setStatus("idle"), 2000)
    } catch (error) {
      setStatus("error")
      setTimeout(() => setStatus("idle"), 3000)
    }
  }

  return { status, save }
}
