'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getUser } from '@/lib/auth'

export default function RootPage() {
  const router = useRouter()
  useEffect(() => {
    const user = getUser()
    router.replace(user ? '/items' : '/login')
  }, [router])
  return null
}
