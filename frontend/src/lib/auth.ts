export interface AuthPayload {
  id: number
  username: string
  role: 'user' | 'admin' | 'super'
  iat: number
  exp: number
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('bom_token')
}

export function setToken(token: string) {
  localStorage.setItem('bom_token', token)
}

export function clearToken() {
  localStorage.removeItem('bom_token')
}

export function decodeToken(token: string): AuthPayload | null {
  try {
    const payloadBase64 = token.split('.')[1]
    // Handle URL-safe base64
    const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(jsonPayload) as AuthPayload
  } catch {
    return null
  }
}

export function getUser(): AuthPayload | null {
  const token = getToken()
  if (!token) return null
  const payload = decodeToken(token)
  if (!payload) return null
  if (payload.exp * 1000 < Date.now()) {
    clearToken()
    return null
  }
  return payload
}

export function isAdmin(user: AuthPayload | null) {
  return user?.role === 'admin' || user?.role === 'super'
}

export function isSuper(user: AuthPayload | null) {
  return user?.role === 'super'
}
