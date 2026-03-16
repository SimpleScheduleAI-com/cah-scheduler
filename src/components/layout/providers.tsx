"use client"

import { ToastProvider } from "@/components/ui/toast"
import { CommandPalette, useCommandPalette } from "@/components/ui/command-palette"
import { KeyboardShortcutsPanel } from "@/components/ui/keyboard-shortcuts"

export function Providers({ children }: { children: React.ReactNode }) {
  const { commands } = useCommandPalette()

  return (
    <ToastProvider>
      {children}
      <CommandPalette commands={commands} />
      <KeyboardShortcutsPanel />
    </ToastProvider>
  )
}
