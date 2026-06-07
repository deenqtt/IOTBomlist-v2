'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { ALL_NAV_ITEMS } from '@/components/layout/sidebar/nav-config'

export type RecentItem = {
  href:  string
  label: string
  ts:    number
}

const STORAGE_KEY = 'sidebar:recents'
const MAX_RECENTS  = 5

function load(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function save(items: RecentItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export function useRecentItems() {
  const pathname = usePathname()
  const [recents, setRecents] = useState<RecentItem[]>([])

  useEffect(() => {
    setRecents(load())
  }, [])

  useEffect(() => {
    const navItem = ALL_NAV_ITEMS.find(
      item => pathname === item.href || pathname.startsWith(item.href + '/')
    )
    if (!navItem) return

    setRecents(prev => {
      const filtered = prev.filter(r => r.href !== navItem.href)
      const next = [
        { href: navItem.href, label: navItem.label, ts: Date.now() },
        ...filtered,
      ].slice(0, MAX_RECENTS)
      save(next)
      return next
    })
  }, [pathname])

  return recents
}
