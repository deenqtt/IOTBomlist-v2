'use client'

import { useState, useEffect } from 'react'
import { getUser, clearToken, type AuthPayload } from '@/lib/auth'

export function useAuth() {
  const [user, setUser] = useState<AuthPayload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setUser(getUser())
    setLoading(false)
  }, [])

  const logout = () => {
    clearToken()
    setUser(null)
    window.location.href = '/login'
  }

  return { user, loading, logout }
}
