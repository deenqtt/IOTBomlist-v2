'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { setToken } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [mounted, setMounted]     = useState(false)
  const [username, setUsername]   = useState('')
  const [password, setPassword]   = useState('')
  const [showPass, setShowPass]   = useState(false)
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [tick, setTick]           = useState(0)

  useEffect(() => {
    setMounted(true)
    const t = setInterval(() => setTick(n => n + 1), 550)
    return () => clearInterval(t)
  }, [])

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

  const blink = tick % 2 === 0

  return (
    <div style={{
      minHeight: '100vh',
      background: '#04080f',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&display=swap');

        * { box-sizing: border-box; }

        @keyframes scanline {
          0%   { transform: translateY(-100vh); opacity: 0; }
          5%   { opacity: 1; }
          95%  { opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }

        @keyframes card-in {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @keyframes pulse-dot {
          0%, 100% { box-shadow: 0 0 3px #00ff41, 0 0 6px #00ff41; opacity: 1; }
          50%       { box-shadow: 0 0 8px #00ff41, 0 0 16px #00ff41; opacity: 0.7; }
        }

        @keyframes grid-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .login-input {
          width: 100%;
          background: #020508;
          border: 1px solid #00d4ff22;
          color: #00d4ff;
          font-family: "JetBrains Mono", monospace;
          font-size: 13px;
          padding: 10px 14px;
          outline: none;
          transition: border-color 0.12s, box-shadow 0.12s;
          caret-color: #00d4ff;
          letter-spacing: 0.02em;
        }
        .login-input:focus {
          border-color: #00d4ff;
          box-shadow: 0 0 0 1px #00d4ff, inset 0 0 24px #00d4ff06;
        }
        .login-input::placeholder { color: #00d4ff22; }

        .login-btn {
          width: 100%;
          background: transparent;
          border: 1px solid #00d4ff;
          color: #00d4ff;
          font-family: "JetBrains Mono", monospace;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.18em;
          padding: 12px;
          cursor: pointer;
          transition: background 0.12s, box-shadow 0.12s;
          text-transform: uppercase;
          position: relative;
        }
        .login-btn:hover:not(:disabled) {
          background: #00d4ff10;
          box-shadow: 0 0 20px #00d4ff28;
        }
        .login-btn:active:not(:disabled) { background: #00d4ff18; }
        .login-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .show-btn {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #00d4ff35;
          cursor: pointer;
          font-family: "JetBrains Mono", monospace;
          font-size: 11px;
          padding: 0;
          transition: color 0.12s;
          letter-spacing: 0;
          line-height: 1;
        }
        .show-btn:hover { color: #00d4ff80; }
      `}</style>

      {/* Grid background */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `
          linear-gradient(#00d4ff07 1px, transparent 1px),
          linear-gradient(90deg, #00d4ff07 1px, transparent 1px)
        `,
        backgroundSize: '44px 44px',
        animation: 'grid-fade 1.2s ease forwards',
        pointerEvents: 'none',
      }} />

      {/* Radial vignette */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse 80% 70% at 50% 50%, transparent 30%, #04080f 100%)',
        pointerEvents: 'none',
      }} />

      {/* Scanline */}
      <div style={{
        position: 'absolute',
        left: 0,
        right: 0,
        height: '3px',
        background: 'linear-gradient(transparent, #00d4ff06, transparent)',
        animation: 'scanline 12s linear infinite',
        pointerEvents: 'none',
      }} />

      {/* Corner labels */}
      <span style={{ position: 'absolute', top: 20, left: 20, color: '#00d4ff18', fontSize: 10, letterSpacing: '0.1em' }}>
        IOTBOM.SYS v2.0
      </span>
      <span style={{ position: 'absolute', top: 20, right: 20, color: '#00d4ff18', fontSize: 10, letterSpacing: '0.1em' }}>
        {mounted ? new Date().toISOString().slice(0, 10) : '----/--/--'}
      </span>
      <span style={{ position: 'absolute', bottom: 20, left: 20, color: '#00d4ff12', fontSize: 10, letterSpacing: '0.1em' }}>
        0x{mounted ? Math.floor(Date.now() / 1000).toString(16).toUpperCase() : '--------'}
      </span>
      <span style={{ position: 'absolute', bottom: 20, right: 20, color: '#00d4ff12', fontSize: 10, letterSpacing: '0.1em' }}>
        GSPETECH © 2026
      </span>

      {/* Card */}
      <div style={{
        width: '100%',
        maxWidth: 380,
        margin: '0 16px',
        animation: mounted ? 'card-in 0.45s cubic-bezier(0.22,1,0.36,1) forwards' : 'none',
        opacity: mounted ? undefined : 0,
      }}>
        <div style={{
          background: '#060c1a',
          border: '1px solid #00d4ff20',
          position: 'relative',
        }}>
          {/* Corner brackets */}
          <span style={{ position: 'absolute', top: -1, left: -1, color: '#00d4ff60', fontSize: 14, lineHeight: 1 }}>┌</span>
          <span style={{ position: 'absolute', top: -1, right: -1, color: '#00d4ff60', fontSize: 14, lineHeight: 1 }}>┐</span>
          <span style={{ position: 'absolute', bottom: -1, left: -1, color: '#00d4ff60', fontSize: 14, lineHeight: 1 }}>└</span>
          <span style={{ position: 'absolute', bottom: -1, right: -1, color: '#00d4ff60', fontSize: 14, lineHeight: 1 }}>┘</span>

          {/* Status bar */}
          <div style={{
            borderBottom: '1px solid #00d4ff15',
            padding: '9px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ color: '#00d4ff35', fontSize: 10, letterSpacing: '0.12em' }}>
              ── SYS.AUTH.MODULE ──────────────
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: '#00ff41',
                animation: 'pulse-dot 2s ease-in-out infinite',
              }} />
              <span style={{ color: '#00ff41', fontSize: 9, letterSpacing: '0.15em' }}>ONLINE</span>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '28px 24px 24px' }}>
            {/* Brand */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: '#00d4ff',
                lineHeight: 1,
                marginBottom: 6,
              }}>
                IOT<span style={{ color: '#00d4ff40' }}>.</span>BOM
              </div>
              <div style={{ color: '#00d4ff30', fontSize: 9, letterSpacing: '0.25em' }}>
                INVENTORY MANAGEMENT SYSTEM
              </div>
            </div>

            {/* Divider */}
            <div style={{
              borderTop: '1px solid #00d4ff12',
              marginBottom: 22,
              position: 'relative',
              textAlign: 'center',
            }}>
              <span style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: '#060c1a',
                padding: '0 10px',
                color: '#00d4ff30',
                fontSize: 9,
                letterSpacing: '0.2em',
              }}>
                AUTHENTICATION REQUIRED
              </span>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Username */}
              <div>
                <label style={{
                  display: 'block',
                  color: '#00d4ff50',
                  fontSize: 9,
                  letterSpacing: '0.18em',
                  marginBottom: 5,
                }}>
                  {'>'} IDENTIFIER
                </label>
                <input
                  className="login-input"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  placeholder="username"
                  required
                />
              </div>

              {/* Password */}
              <div>
                <label style={{
                  display: 'block',
                  color: '#00d4ff50',
                  fontSize: 9,
                  letterSpacing: '0.18em',
                  marginBottom: 5,
                }}>
                  {'>'} ACCESS KEY
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="login-input"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    required
                    style={{ paddingRight: 48 }}
                  />
                  <button
                    type="button"
                    className="show-btn"
                    onClick={() => setShowPass(v => !v)}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? '[●]' : '[○]'}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  background: '#ff630008',
                  border: '1px solid #ff630035',
                  padding: '8px 12px',
                }}>
                  <span style={{
                    color: '#ff7a35',
                    fontSize: 10,
                    letterSpacing: '0.06em',
                  }}>
                    {`[ERR_401] ${error}`}
                  </span>
                </div>
              )}

              {/* Submit */}
              <button
                className="login-btn"
                type="submit"
                disabled={loading}
                style={{ marginTop: 4 }}
              >
                {loading
                  ? `◌ VERIFYING${blink ? '_' : ' '}`
                  : '◈  AUTHENTICATE'}
              </button>
            </form>
          </div>

          {/* Footer bar */}
          <div style={{
            borderTop: '1px solid #00d4ff10',
            padding: '8px 16px',
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <span style={{ color: '#00d4ff18', fontSize: 9, letterSpacing: '0.1em' }}>TLS 1.3</span>
            <span style={{ color: '#00d4ff18', fontSize: 9, letterSpacing: '0.1em' }}>AES-256 ■</span>
          </div>
        </div>

        {/* Hint */}
        <div style={{
          textAlign: 'center',
          marginTop: 14,
          color: '#00d4ff18',
          fontSize: 9,
          letterSpacing: '0.2em',
        }}>
          AUTHORIZED PERSONNEL ONLY
        </div>
      </div>
    </div>
  )
}
