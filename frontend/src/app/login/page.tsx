'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Eye, EyeOff, Layers, ShieldCheck, Cpu } from 'lucide-react'
import api from '@/lib/api'
import { setToken, getUser } from '@/lib/auth'
import { cn } from '@/lib/utils'

const features = [
  {
    icon: Layers,
    title: 'Real-time Inventory',
    desc: 'Manage components, stock levels, and supplier pricing all in one place.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure & Reliable',
    desc: 'Enterprise-grade security to protect your BOM data and company assets.',
  },
  {
    icon: Cpu,
    title: 'Multi-supplier Lookup',
    desc: 'Direct integration with LCSC, Mouser, and DigiKey in real-time.',
  },
]

export default function LoginPage() {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted]   = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    setMounted(true)
    if (getUser()) router.replace('/items')
  }, [router])

  const iconSrc = !mounted ? '/icon/icon_dark.svg'
    : resolvedTheme === 'dark' ? '/icon/icon_light.svg' : '/icon/icon_dark.svg'

  const isDark = mounted && resolvedTheme === 'dark'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/auth/login', { username, password })
      setToken(res.data.token)
      router.replace('/items')
    } catch {
      setError('Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Left: Form ───────────────────────────── */}
      <div className={cn(
        'flex flex-col justify-center w-full lg:w-[44%] px-8 sm:px-12 lg:px-16',
        'bg-white dark:bg-[#0f1621]',
      )}>
        <div className="w-full max-w-[360px] mx-auto">
          {/* Brand */}
          <div className="flex items-center gap-3 mb-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={iconSrc}
              alt="IOT BOM List"
              width={38}
              height={38}
              draggable={false}
              className="select-none rounded-xl"
            />
            <div>
              <p className="text-[15px] font-bold tracking-tight text-gray-900 dark:text-gray-50 leading-tight">
                IOT BOM List
              </p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                Bill of Materials Management
              </p>
            </div>
          </div>

          {/* Heading */}
          <div className="mb-7">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
              Welcome back
            </h1>
            <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1.5">
              Please enter your credentials to access the system
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div className="space-y-1.5">
              <label
                htmlFor="username"
                className="text-[13px] font-medium text-gray-700 dark:text-gray-300"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="Enter your username"
                required
                className={cn(
                  'w-full px-3.5 py-2.5 rounded-lg text-[13px]',
                  'bg-gray-50 dark:bg-[#161e2d]',
                  'border border-gray-200 dark:border-[#253047]',
                  'text-gray-900 dark:text-gray-100',
                  'placeholder:text-gray-400 dark:placeholder:text-gray-600',
                  'transition-[border-color,box-shadow] duration-150',
                  'focus:outline-none focus:border-blue-500 dark:focus:border-blue-400',
                  'focus:ring-2 focus:ring-blue-500/15 dark:focus:ring-blue-400/20',
                )}
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-[13px] font-medium text-gray-700 dark:text-gray-300"
                >
                  Password
                </label>
                <span className="text-[12px] text-blue-500 dark:text-blue-400 cursor-default select-none">
                  Forgot password?
                </span>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                  className={cn(
                    'w-full pl-3.5 pr-10 py-2.5 rounded-lg text-[13px]',
                    'bg-gray-50 dark:bg-[#161e2d]',
                    'border border-gray-200 dark:border-[#253047]',
                    'text-gray-900 dark:text-gray-100',
                    'placeholder:text-gray-400 dark:placeholder:text-gray-600',
                    'transition-[border-color,box-shadow] duration-150',
                    'focus:outline-none focus:border-blue-500 dark:focus:border-blue-400',
                    'focus:ring-2 focus:ring-blue-500/15 dark:focus:ring-blue-400/20',
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-2.5">
              <input
                id="remember"
                type="checkbox"
                className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 accent-blue-500"
              />
              <label htmlFor="remember" className="text-[13px] text-gray-600 dark:text-gray-400 select-none cursor-pointer">
                Remember me
              </label>
            </div>

            {/* Error */}
            {error && (
              <div className="px-3.5 py-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50">
                <p className="text-[12px] text-red-600 dark:text-red-400 font-medium">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className={cn(
                'w-full py-2.5 px-4 mt-1 rounded-lg text-[13px] font-semibold text-white',
                'flex items-center justify-center gap-2',
                'disabled:opacity-60 disabled:cursor-not-allowed',
                'active:scale-[0.98] transition-[transform,opacity] duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
              )}
              style={{
                background: isDark
                  ? 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)'
                  : 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
                boxShadow: '0 2px 12px rgba(37,99,235,0.35)',
              }}
            >
              {loading ? 'Signing in...' : (
                <>
                  Sign In
                  <span className="text-blue-200">→</span>
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-[12px] text-gray-400 dark:text-gray-600 mt-8">
            Don&apos;t have an account?{' '}
            <span className="text-blue-500 dark:text-blue-400 cursor-default">Contact admin</span>
          </p>
        </div>
      </div>

      {/* ── Right: Marketing panel ────────────────── */}
      <div
        className="hidden lg:flex flex-col justify-between flex-1 p-14"
        style={{
          background: 'linear-gradient(145deg, #0a1628 0%, #102a4c 45%, #0d3557 100%)',
        }}
      >
        {/* Top: Headline */}
        <div>
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-white leading-tight mb-4">
              Streamline Your<br />
              <span style={{ color: '#60a5fa' }}>IoT Material Management</span>
            </h2>
            <p className="text-[14px] text-blue-200/60 leading-relaxed max-w-sm">
              Manage BOM, component inventory, and production cost estimates
              in one unified platform.
            </p>
          </div>

          {/* Features */}
          <div className="space-y-6">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-4">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.2)' }}
                >
                  <Icon size={16} style={{ color: '#60a5fa' }} />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-white mb-0.5">{title}</p>
                  <p className="text-[12px] text-blue-200/50 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: Testimonial */}
        <div
          className="rounded-2xl p-5 mt-10"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <p className="text-[13px] text-blue-100/70 italic leading-relaxed mb-4">
            &ldquo;This platform has transformed how we manage hundreds of PCB
            components — from sourcing to production cost estimation.&rdquo;
          </p>
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}
            >
              HW
            </div>
            <div>
              <p className="text-[12px] font-semibold text-white">Hardware Team</p>
              <p className="text-[11px] text-blue-200/40">GSPE Technology</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
