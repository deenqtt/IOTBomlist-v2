'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Eye, EyeOff } from 'lucide-react'
import api from '@/lib/api'
import { setToken } from '@/lib/auth'
import { cn } from '@/lib/utils'

export default function LoginPage() {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [username, setUsername]       = useState('')
  const [password, setPassword]       = useState('')
  const [showPass, setShowPass]       = useState(false)
  const [error, setError]             = useState('')
  const [loading, setLoading]         = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // Defer icon until mounted to avoid SSR/client mismatch
  const iconSrc = !mounted ? '/icon/icon_dark.svg'
    : resolvedTheme === 'dark' ? '/icon/icon_light.svg' : '/icon/icon_dark.svg'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/auth/login', { username, password })
      setToken(res.data.token)
      router.push('/items')
    } catch {
      setError('Username atau password salah')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[hsl(var(--login-bg))]">
      {/* Dot grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle, hsl(var(--login-dot)) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Radial glow center */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-[600px] h-[400px] rounded-full bg-[hsl(var(--nav-active-indicator))] opacity-[0.06] blur-[80px]" />
      </div>

      {/* Card */}
      <div className={cn(
        'relative z-10 w-full max-w-[380px] mx-4',
        'bg-[hsl(var(--login-card))] border border-[hsl(var(--login-card-border))]',
        'rounded-2xl shadow-[0_8px_40px_-8px_hsl(var(--login-shadow))]',
        'p-8',
      )}>
        {/* Branding */}
        <div className="flex items-center gap-3 mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={iconSrc}
            alt="IOT BOM List"
            width={40}
            height={40}
            draggable={false}
            className="select-none rounded-xl"
          />
          <div>
            <h1 className="text-[15px] font-bold tracking-tight leading-tight">
              IOT BOM List
            </h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Bill of Materials Management
            </p>
          </div>
        </div>

        {/* Heading */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold tracking-tight">Masuk</h2>
          <p className="text-[13px] text-muted-foreground mt-1">
            Masukkan kredensial untuk melanjutkan
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="username"
              required
              className={cn(
                'w-full px-3 py-2.5 rounded-lg text-[13px]',
                'bg-[hsl(var(--login-input-bg))] border border-[hsl(var(--login-input-border))]',
                'text-foreground placeholder:text-muted-foreground/60',
                'transition-[border-color,box-shadow] duration-150',
                'focus:outline-none focus:border-[hsl(var(--ring))] focus:ring-2 focus:ring-[hsl(var(--ring))]/20',
              )}
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                required
                className={cn(
                  'w-full pl-3 pr-10 py-2.5 rounded-lg text-[13px]',
                  'bg-[hsl(var(--login-input-bg))] border border-[hsl(var(--login-input-border))]',
                  'text-foreground placeholder:text-muted-foreground/60',
                  'transition-[border-color,box-shadow] duration-150',
                  'focus:outline-none focus:border-[hsl(var(--ring))] focus:ring-2 focus:ring-[hsl(var(--ring))]/20',
                )}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                aria-label={showPass ? 'Hide password' : 'Show password'}
                className={cn(
                  'absolute right-3 top-1/2 -translate-y-1/2',
                  'text-muted-foreground/60',
                  '[@media(hover:hover)]:hover:text-foreground',
                  'transition-colors duration-150',
                  'focus-visible:outline-none',
                )}
              >
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-[12px] text-destructive font-medium">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className={cn(
              'w-full py-2.5 px-4 mt-1 rounded-lg text-[13px] font-semibold',
              'bg-[hsl(var(--nav-active-indicator))] text-white',
              '[@media(hover:hover)]:hover:bg-[hsl(var(--nav-active-indicator))]/90',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'active:scale-[0.98] transition-[transform,opacity,background-color] duration-150',
              'motion-reduce:active:scale-100',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2',
            )}
          >
            {loading ? 'Masuk...' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  )
}
