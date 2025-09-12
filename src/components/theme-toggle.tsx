
"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"

export function ThemeToggle() {
  const { setTheme, theme } = useTheme()
  const { setOpenMobile } = useSidebar()

  const handleThemeChange = () => {
    setTheme(theme === "light" ? "dark" : "light")
    setOpenMobile(false)
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleThemeChange}
    >
      <Moon className="h-[1.5rem] w-[1.3rem] text-blue-400 opacity-100 dark:hidden" />
      <Sun className="hidden h-5 w-5 text-blue-400 opacity-100 dark:block" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
