'use client'

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'sidebar:collapsed'

export function useSidebarState() {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) setCollapsed(stored === 'true')
  }, [])

  function toggle() {
    setCollapsed(v => {
      const next = !v
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }

  function setCollapsedPersist(value: boolean) {
    localStorage.setItem(STORAGE_KEY, String(value))
    setCollapsed(value)
  }

  return { collapsed, toggle, setCollapsed: setCollapsedPersist }
}
