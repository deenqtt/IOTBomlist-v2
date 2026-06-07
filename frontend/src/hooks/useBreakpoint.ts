'use client'

import { useState, useEffect } from 'react'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop' | 'wide'

function getBreakpoint(width: number): Breakpoint {
  if (width < 768)  return 'mobile'
  if (width < 1024) return 'tablet'
  if (width < 1280) return 'desktop'
  return 'wide'
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>('wide')

  useEffect(() => {
    function onResize() {
      setBp(getBreakpoint(window.innerWidth))
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return bp
}
